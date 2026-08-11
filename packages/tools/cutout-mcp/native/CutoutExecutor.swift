import Darwin
import Foundation

private let maximumHelperDiagnosticBytes = 4 * 1024

private final class BoundedDiagnosticCapture {
  private let lock = NSLock()
  private var bytes = Data()
  private var truncated = false

  func append(_ data: Data) {
    lock.lock()
    defer { lock.unlock() }
    let remaining = maximumHelperDiagnosticBytes - bytes.count
    if remaining > 0 { bytes.append(data.prefix(remaining)) }
    if data.count > remaining { truncated = true }
  }

  func summary() -> String? {
    lock.lock()
    let snapshot = bytes
    let wasTruncated = truncated
    lock.unlock()
    let scalars = String(decoding: snapshot, as: UTF8.self).unicodeScalars.map { scalar -> Character in
      scalar.value < 0x20 || scalar.value == 0x7f ? " " : Character(String(scalar))
    }
    let normalized = String(scalars).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    if normalized.isEmpty { return wasTruncated ? "truncated" : nil }
    return wasTruncated ? "\(normalized) [truncated]" : normalized
  }
}

private func atExecutionStage<T>(_ stage: ExecutionStage, _ operation: () throws -> T) throws -> T {
  do {
    return try operation()
  } catch let error as PublicInputError {
    throw error
  } catch let error as CancellationError {
    throw error
  } catch let error as ExecutionError {
    throw ExecutionError(
      stage: error.stage == .internalBoundary ? stage : error.stage,
      diagnostic: error.diagnostic
    )
  } catch {
    throw ExecutionError(stage: stage)
  }
}

final class TransformControl {
  private let lock = NSLock()
  private var cancelled = false
  private var process: Process?

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  func attach(_ process: Process) {
    lock.lock()
    self.process = process
    let shouldCancel = cancelled
    lock.unlock()
    if shouldCancel { terminate(process) }
  }

  func detach(_ process: Process) {
    lock.lock()
    if self.process === process { self.process = nil }
    lock.unlock()
  }

  func cancel() {
    lock.lock()
    cancelled = true
    let current = process
    lock.unlock()
    if let current { terminate(current) }
  }

  private func terminate(_ process: Process) {
    guard process.isRunning else { return }
    process.terminate()
    let identifier = process.processIdentifier
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + .milliseconds(750)) {
      if process.isRunning { Darwin.kill(identifier, SIGKILL) }
    }
  }
}

final class CutoutEngine {
  private let runtimeLock = NSLock()
  private var runtime: EmbeddedRuntimeLease?

  private func preparedRuntime() throws -> EmbeddedRuntimeLease {
    runtimeLock.lock()
    defer { runtimeLock.unlock() }
    if let runtime { return runtime }
    let created = try EmbeddedRuntimeLease()
    runtime = created
    return created
  }

  private func executeHelper(
    reference: VerifiedReference,
    scope: OutputScope,
    runtime: EmbeddedRuntimeLease,
    control: TransformControl
  ) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: runtime.helperPath)
    process.arguments = [reference.path, scope.outputPath, runtime.modelPath]
    process.currentDirectoryURL = URL(fileURLWithPath: scope.directoryPath, isDirectory: true)
    process.environment = ["LANG": "C", "LC_ALL": "C"]
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    let standardError = Pipe()
    let diagnostic = BoundedDiagnosticCapture()
    let diagnosticReaders = DispatchGroup()
    diagnosticReaders.enter()
    DispatchQueue.global(qos: .utility).async {
      defer {
        try? standardError.fileHandleForReading.close()
        diagnosticReaders.leave()
      }
      while true {
        guard let data = try? standardError.fileHandleForReading.read(upToCount: 1_024), !data.isEmpty else { return }
        diagnostic.append(data)
      }
    }
    process.standardError = standardError
    do {
      try process.run()
    } catch {
      try? standardError.fileHandleForWriting.close()
      diagnosticReaders.wait()
      throw ExecutionError(stage: .helperLaunch)
    }
    try? standardError.fileHandleForWriting.close()
    control.attach(process)
    defer { control.detach(process) }

    var monitorFailure: Error?
    while process.isRunning {
      do {
        if control.isCancelled { throw CancellationError() }
        try atExecutionStage(.inputMonitor) { try reference.assertStable() }
        try atExecutionStage(.outputMonitor) { try scope.inspect(requireCompleteOutput: false) }
      } catch {
        monitorFailure = error
        control.cancel()
        break
      }
      Thread.sleep(forTimeInterval: 0.025)
    }
    process.waitUntilExit()
    diagnosticReaders.wait()
    if let monitorFailure { throw monitorFailure }
    if control.isCancelled { throw CancellationError() }
    guard process.terminationReason == .exit, process.terminationStatus == 0 else {
      let reason = process.terminationReason == .exit ? "exit" : "signal"
      let status = process.terminationStatus
      let helperDiagnostic = diagnostic.summary().map { " helper=\($0)" } ?? ""
      throw ExecutionError(stage: .helperExit, diagnostic: "reason=\(reason) status=\(status)\(helperDiagnostic)")
    }
  }

  func generate(_ call: GenerationCall, control: TransformControl) throws -> [GenerationArtifact] {
    if control.isCancelled { throw CancellationError() }
    let reference = try atExecutionStage(.referenceValidation) { try verifyReference(call.references[0]) }
    let scope = try atExecutionStage(.outputPreparation) {
      try prepareOutputScope(directory: call.outputDirectory, outputName: "cutout.png")
    }
    var completed = false
    defer {
      if !completed { scope.removeIncompleteOutputs() }
    }
    let runtime = try atExecutionStage(.runtimePreparation) { try preparedRuntime() }
    var retried = false
    while true {
      try atExecutionStage(.preflight) {
        try reference.assertStable()
        try scope.inspect(requireCompleteOutput: false)
      }
      if control.isCancelled { throw CancellationError() }
      do {
        try executeHelper(reference: reference, scope: scope, runtime: runtime, control: control)
        break
      } catch let error as ExecutionError where
        !retried && (error.stage == .helperLaunch || error.stage == .helperExit)
      {
        retried = true
        let detail = error.diagnostic.map { " detail=\($0)" } ?? ""
        FileHandle.standardError.write(Data("[cutout] stage=\(error.stage.rawValue) retry=1\(detail)\n".utf8))
        scope.removeIncompleteOutputs()
      }
    }
    try atExecutionStage(.outputValidation) {
      try reference.assertStable()
      try scope.inspect(requireCompleteOutput: true)
      try validatePNG(path: scope.outputPath)
    }
    completed = true
    return [GenerationArtifact(mimeType: "image/png", name: "cutout.png", path: "cutout.png")]
  }
}

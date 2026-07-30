import Darwin
import Foundation

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

  func generate(_ call: GenerationCall, control: TransformControl) throws -> [GenerationArtifact] {
    if control.isCancelled { throw CancellationError() }
    let reference = try verifyReference(call.references[0])
    let scope = try prepareOutputScope(directory: call.outputDirectory, outputName: "cutout.png")
    var completed = false
    defer {
      if !completed { scope.removeIncompleteOutputs() }
    }
    let runtime = try preparedRuntime()
    try reference.assertStable()
    try scope.inspect(requireCompleteOutput: false)
    if control.isCancelled { throw CancellationError() }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: runtime.helperPath)
    process.arguments = [reference.path, scope.outputPath, runtime.modelPath]
    process.currentDirectoryURL = URL(fileURLWithPath: scope.directoryPath, isDirectory: true)
    process.environment = ["LANG": "C", "LC_ALL": "C"]
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    do {
      try process.run()
    } catch {
      throw ExecutionError()
    }
    control.attach(process)
    defer { control.detach(process) }

    var monitorFailure: Error?
    while process.isRunning {
      do {
        if control.isCancelled { throw CancellationError() }
        try reference.assertStable()
        try scope.inspect(requireCompleteOutput: false)
      } catch {
        monitorFailure = error
        control.cancel()
        break
      }
      Thread.sleep(forTimeInterval: 0.025)
    }
    process.waitUntilExit()
    if let monitorFailure { throw monitorFailure }
    if control.isCancelled { throw CancellationError() }
    guard process.terminationReason == .exit, process.terminationStatus == 0 else {
      throw ExecutionError()
    }
    try reference.assertStable()
    try scope.inspect(requireCompleteOutput: true)
    try validatePNG(path: scope.outputPath)
    completed = true
    return [GenerationArtifact(mimeType: "image/png", name: "cutout.png", path: "cutout.png")]
  }
}

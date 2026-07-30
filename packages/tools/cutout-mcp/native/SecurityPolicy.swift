import Darwin
import Foundation

struct FileIdentity: Equatable {
  let device: dev_t
  let inode: ino_t
  let mode: mode_t
  let size: off_t
  let modifiedSeconds: Int
  let modifiedNanoseconds: Int

  init(_ value: stat) {
    device = value.st_dev
    inode = value.st_ino
    mode = value.st_mode
    size = value.st_size
    modifiedSeconds = value.st_mtimespec.tv_sec
    modifiedNanoseconds = value.st_mtimespec.tv_nsec
  }

  var isRegularFile: Bool { mode & S_IFMT == S_IFREG }
  var isDirectory: Bool { mode & S_IFMT == S_IFDIR }
  var isSymbolicLink: Bool { mode & S_IFMT == S_IFLNK }
}

private func status(at path: String) throws -> FileIdentity {
  var value = stat()
  guard path.withCString({ Darwin.lstat($0, &value) }) == 0 else { throw ExecutionError() }
  return FileIdentity(value)
}

private func canonicalPath(_ path: String) throws -> String {
  guard let pointer = realpath(path, nil) else { throw ExecutionError() }
  defer { free(pointer) }
  return String(cString: pointer)
}

func sniffImageMimeType(_ header: [UInt8]) -> String? {
  func ascii(_ offset: Int, _ length: Int) -> String? {
    guard header.count >= offset + length else { return nil }
    return String(bytes: header[offset..<(offset + length)], encoding: .ascii)
  }
  if header.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) { return "image/png" }
  if header.count >= 3, header[0] == 0xff, header[1] == 0xd8, header[2] == 0xff { return "image/jpeg" }
  if ascii(0, 4) == "RIFF", ascii(8, 4) == "WEBP" { return "image/webp" }
  return nil
}

private func stableHeader(path: String, maximumBytes: Int = 32) throws -> ([UInt8], FileIdentity) {
  let descriptor = path.withCString { Darwin.open($0, O_RDONLY | O_NOFOLLOW | O_CLOEXEC) }
  guard descriptor >= 0 else {
    throw PublicInputError(message: "The staged Cutout input is not a readable regular file.")
  }
  defer { Darwin.close(descriptor) }
  var before = stat()
  guard fstat(descriptor, &before) == 0 else { throw ExecutionError() }
  let identity = FileIdentity(before)
  guard identity.isRegularFile, identity.size > 0, identity.size <= maximumArtifactBytes else {
    throw PublicInputError(message: "The staged Cutout input exceeds the local image boundary.")
  }
  var bytes = [UInt8](repeating: 0, count: min(maximumBytes, Int(identity.size)))
  let count = bytes.withUnsafeMutableBytes { pointer in
    pread(descriptor, pointer.baseAddress, pointer.count, 0)
  }
  guard count == bytes.count else { throw ExecutionError() }
  var after = stat()
  guard fstat(descriptor, &after) == 0, FileIdentity(after) == identity else { throw ExecutionError() }
  return (bytes, identity)
}

struct VerifiedReference {
  let path: String
  private let identity: FileIdentity

  init(path: String, identity: FileIdentity) {
    self.path = path
    self.identity = identity
  }

  func assertStable() throws {
    guard try status(at: path) == identity else { throw ExecutionError() }
  }
}

func verifyReference(_ reference: GenerationReference) throws -> VerifiedReference {
  guard (reference.path as NSString).isAbsolutePath,
        !reference.path.contains("%"),
        !reference.path.contains("*"),
        !reference.path.contains("?"),
        !reference.path.contains("[")
  else {
    throw PublicInputError(message: "The Cutout reference path is not a safe staged file path.")
  }
  let unresolved = try status(at: reference.path)
  guard unresolved.isRegularFile, !unresolved.isSymbolicLink else {
    throw PublicInputError(message: "The Cutout reference must be a non-symbolic regular file.")
  }
  let path = try canonicalPath(reference.path)
  let (header, identity) = try stableHeader(path: path)
  guard identity.device == unresolved.device, identity.inode == unresolved.inode else {
    throw PublicInputError(message: "The Cutout reference changed during validation.")
  }
  guard let detected = sniffImageMimeType(header),
        detected == normalizeMimeType(reference.mimeType)
  else {
    throw PublicInputError(message: "The Cutout reference MIME type does not match its image content.")
  }
  return VerifiedReference(path: path, identity: identity)
}

struct OutputScope {
  let directoryPath: String
  let directoryIdentity: DirectoryIdentity
  let outputName: String
  let outputPath: String

  private var transientPrefix: String { ".\(outputName)-" }

  func inspect(requireCompleteOutput: Bool) throws {
    guard DirectoryIdentity(try status(at: directoryPath)) == directoryIdentity else { throw ExecutionError() }
    let entries = try FileManager.default.contentsOfDirectory(atPath: directoryPath)
    if requireCompleteOutput {
      guard entries == [outputName] || Set(entries) == Set([outputName]) else { throw ExecutionError() }
    } else {
      let transient = entries.filter { $0.hasPrefix(transientPrefix) }
      guard transient.count <= 1,
            entries.allSatisfy({ $0 == outputName || $0.hasPrefix(transientPrefix) }),
            entries.count <= 2
      else { throw ExecutionError() }
    }
    for entry in entries {
      let candidate = (directoryPath as NSString).appendingPathComponent(entry)
      let output = try status(at: candidate)
      guard output.isRegularFile,
            !output.isSymbolicLink,
            output.size >= 0,
            output.size <= maximumArtifactBytes,
            !requireCompleteOutput || output.size > 0
      else { throw ExecutionError() }
    }
  }

  func removeIncompleteOutputs() {
    guard let entries = try? FileManager.default.contentsOfDirectory(atPath: directoryPath),
          let directoryStatus = try? status(at: directoryPath),
          DirectoryIdentity(directoryStatus) == directoryIdentity
    else { return }
    for entry in entries where entry == outputName || entry.hasPrefix(transientPrefix) {
      let candidate = (directoryPath as NSString).appendingPathComponent(entry)
      guard let identity = try? status(at: candidate),
            identity.isRegularFile,
            !identity.isSymbolicLink
      else { continue }
      _ = candidate.withCString { Darwin.unlink($0) }
    }
  }
}

struct DirectoryIdentity: Equatable {
  let device: dev_t
  let inode: ino_t
  let mode: mode_t

  init(_ value: FileIdentity) {
    device = value.device
    inode = value.inode
    mode = value.mode
  }
}

func prepareOutputScope(directory: String, outputName: String) throws -> OutputScope {
  guard (directory as NSString).isAbsolutePath else {
    throw PublicInputError(message: "output_directory must be an absolute host directory.")
  }
  let unresolved = try status(at: directory)
  guard unresolved.isDirectory, !unresolved.isSymbolicLink else { throw ExecutionError() }
  let canonical = try canonicalPath(directory)
  guard try FileManager.default.contentsOfDirectory(atPath: canonical).isEmpty else {
    throw PublicInputError(message: "output_directory must be empty before local Cutout inference.")
  }
  let scope = OutputScope(
    directoryPath: canonical,
    directoryIdentity: DirectoryIdentity(try status(at: canonical)),
    outputName: outputName,
    outputPath: (canonical as NSString).appendingPathComponent(outputName)
  )
  try scope.inspect(requireCompleteOutput: false)
  return scope
}

func validatePNG(path: String) throws {
  let (header, _) = try stableHeader(path: path)
  guard sniffImageMimeType(header) == "image/png" else { throw ExecutionError() }
}

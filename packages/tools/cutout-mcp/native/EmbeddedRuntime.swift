import CryptoKit
import Darwin
import Foundation

private let maximumCompressedResourceBytes = 128 * 1024 * 1024
private let maximumExpandedResourceBytes = 256 * 1024 * 1024

private struct EmbeddedResource {
  let bytes: UnsafePointer<UInt8>
  let compressedSize: Int
  let expectedHash: String
  let expandedSize: Int
  let name: String
  let executable: Bool
}

private func text(
  _ pointer: UnsafePointer<UInt8>?,
  size: Int,
  pattern: String
) throws -> String {
  guard let pointer, size > 0, size <= 128 else { throw ExecutionError() }
  let value = String(decoding: UnsafeBufferPointer(start: pointer, count: size), as: UTF8.self)
  guard value.range(of: pattern, options: .regularExpression) != nil else { throw ExecutionError() }
  return value
}

private func resource(
  data: (UnsafeMutablePointer<Int>) -> UnsafePointer<UInt8>?,
  hash: (UnsafeMutablePointer<Int>) -> UnsafePointer<UInt8>?,
  size: (UnsafeMutablePointer<Int>) -> UnsafePointer<UInt8>?,
  name: String,
  executable: Bool
) throws -> EmbeddedResource {
  var compressedSize = 0
  var hashSize = 0
  var expandedSizeLength = 0
  guard let bytes = data(&compressedSize),
        compressedSize > 0,
        compressedSize <= maximumCompressedResourceBytes
  else { throw ExecutionError() }
  let expectedHash = try text(hash(&hashSize), size: hashSize, pattern: "^[0-9a-f]{64}$")
  let expandedText = try text(size(&expandedSizeLength), size: expandedSizeLength, pattern: "^[1-9][0-9]{0,11}$")
  guard let expandedSize = Int(expandedText),
        expandedSize > 0,
        expandedSize <= maximumExpandedResourceBytes
  else { throw ExecutionError() }
  return EmbeddedResource(
    bytes: bytes,
    compressedSize: compressedSize,
    expectedHash: expectedHash,
    expandedSize: expandedSize,
    name: name,
    executable: executable
  )
}

private func sha256(path: String) throws -> String {
  let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
  defer { try? handle.close() }
  var hasher = SHA256()
  while true {
    let data = try handle.read(upToCount: 1024 * 1024) ?? Data()
    if data.isEmpty { break }
    hasher.update(data: data)
  }
  return hasher.finalize().map { String(format: "%02x", $0) }.joined()
}

private func materialize(_ resource: EmbeddedResource, directory: String) throws -> String {
  let path = (directory as NSString).appendingPathComponent(resource.name)
  let descriptor = path.withCString {
    Darwin.open($0, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, S_IRUSR | S_IWUSR)
  }
  guard descriptor >= 0 else { throw ExecutionError() }
  var failed = false
  if convax_cutout_inflate_gzip_to_fd(
    resource.bytes,
    resource.compressedSize,
    descriptor,
    resource.expandedSize
  ) != 0 {
    failed = true
  }
  if !failed, fchmod(descriptor, resource.executable ? S_IRUSR | S_IXUSR : S_IRUSR) != 0 { failed = true }
  if !failed, fsync(descriptor) != 0 { failed = true }
  if Darwin.close(descriptor) != 0 { failed = true }
  guard !failed,
        (try FileManager.default.attributesOfItem(atPath: path)[.size] as? NSNumber)?.intValue == resource.expandedSize,
        try sha256(path: path) == resource.expectedHash
  else {
    _ = path.withCString { Darwin.unlink($0) }
    throw ExecutionError()
  }
  return path
}

final class EmbeddedRuntimeLease {
  let helperPath: String
  let modelPath: String
  private let directory: String
  private let lock = NSLock()
  private var disposed = false

  init() throws {
    let resources = try [
      resource(
        data: convax_cutout_helper,
        hash: convax_cutout_helper_sha256,
        size: convax_cutout_helper_size,
        name: "convax-cutout-inference",
        executable: true
      ),
      resource(
        data: convax_cutout_model,
        hash: convax_cutout_model_sha256,
        size: convax_cutout_model_size,
        name: "u2netp.onnx",
        executable: false
      ),
      resource(
        data: convax_cutout_ort,
        hash: convax_cutout_ort_sha256,
        size: convax_cutout_ort_size,
        name: "libonnxruntime.1.23.2.dylib",
        executable: false
      ),
    ]
    let base = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().path
    let candidate = (base as NSString).appendingPathComponent(".convax-cutout-runtime-\(UUID().uuidString)")
    try FileManager.default.createDirectory(
      atPath: candidate,
      withIntermediateDirectories: false,
      attributes: [.posixPermissions: 0o700]
    )
    directory = candidate
    do {
      helperPath = try materialize(resources[0], directory: candidate)
      modelPath = try materialize(resources[1], directory: candidate)
      _ = try materialize(resources[2], directory: candidate)
    } catch {
      try? FileManager.default.removeItem(atPath: candidate)
      throw error
    }
  }

  func dispose() {
    lock.lock()
    if disposed {
      lock.unlock()
      return
    }
    disposed = true
    lock.unlock()
    try? FileManager.default.removeItem(atPath: directory)
  }

  deinit { dispose() }
}

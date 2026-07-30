# Convax Cutout MCP

Reviewed macOS 13.4+ arm64 companion for `cutout-studio`.

The release executable embeds one SHA-256 verified native helper, the pinned
Apache-2.0 U-2-Netp ONNX model, and ONNX Runtime 1.23.2. It reproduces the
reference 320×320 letterboxed preprocessing and matte postprocessing locally.

At runtime the helper is expanded into a private temporary directory. The MCP
process accepts one host-staged PNG, JPEG, or WebP reference and returns one
original-size transparent PNG in the host-owned output directory. It has no
runtime network code, credentials, shell, ambient file discovery, or model
download path.

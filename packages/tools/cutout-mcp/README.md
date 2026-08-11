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

The MCP response keeps inference failures generic. The companion drains at most
4 KiB of helper stderr, normalizes it, and writes one private stage-tagged diagnostic
to its own stderr so host logs can distinguish launch, runtime, monitoring, helper
exit, and output-validation failures without persisting those details in Canvas.
One launch/exit failure receives a single in-operation retry after incomplete output
cleanup; deterministic failures remain generic to the caller and retain both retry
and terminal stage diagnostics privately.

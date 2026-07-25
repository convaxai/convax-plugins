# ChatCut media-import companion contract

This workspace is a prototype for an independently reviewed companion
executable. It inherits the repository contract.

## Ownership

- Own the `media.import` stdio MCP implementation and the client side of
  ChatCut's short-lived media-import session protocol.
- Consume only host-staged `convax.generation-call/1` references. Never accept
  arbitrary path arguments or expose staged paths to ChatCut, the MCP result,
  stdout, or diagnostics.
- Keep the ChatCut OAuth flow in the hosted MCP client. This tool accepts only
  the short-lived import token and endpoint returned by ChatCut's
  `import_media` tool.

## Security

- Production endpoints must have the exact `https://api.chatcut.io` origin.
  Test transports are injected in-process and must not be configurable through
  environment variables or MCP inputs.
- Never log or persist the session token, endpoint, presigned URLs, native
  paths, upstream response bodies, or media bytes.
- Treat presigned upload URLs as opaque HTTPS capabilities obtained only from
  the validated ChatCut endpoint. Bound response sizes and individual network
  attempts, honor cancellation, and do not impose an overall upload deadline.
- The current `PATH` resolution for `ffmpeg` and `ffprobe` is a development
  prototype only. Those secondary executables are outside the companion's
  immutable Registry receipt, so this artifact must not be published.
- Release is blocked until the exact media toolchain is pinned and admitted as
  part of the same verified target (for example, bundled into a self-contained
  companion) or Convax gains a generic separately verified dependency
  mechanism. Do not weaken or remove this blocker merely because a developer
  machine has working commands on `PATH`.
- While the prototype remains, failure to resolve or run either media tool must
  return a bounded public setup error.

## Verification

Run `bun run typecheck`, `bun run test`, and
`bun run build:release:darwin-arm64`. Tests must use injected mock transport
and never contact ChatCut or upload real user media. A successful build or pack
does not clear the pinned-toolchain release blocker above.

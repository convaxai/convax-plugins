# Convax ChatCut media-import MCP

This prototype companion bridges Convax's host-staged Canvas media inputs to a
short-lived upload session created by ChatCut's hosted `import_media` MCP tool.
It is designed to be distributed separately from the static ChatCut Plugin ZIP
and run only after Convax verifies and authorizes immutable release bytes.

> **Release blocker:** this prototype currently resolves `ffmpeg` and
> `ffprobe` from the inherited `PATH`. Those secondary executables are not
> covered by the companion's immutable Registry receipt, so the generated
> artifact must not be published. Before release, pin and bundle the exact
> media toolchain into the verified target, or first add a generic Convax
> mechanism that separately verifies every executable dependency.

The companion exposes one stdio MCP tool, `media.import`. Convax supplies a
`convax.generation-call/1` envelope with up to four directly connected staged
image, video, or audio references, plus the short-lived `session_token` and
`endpoint` returned by ChatCut. The endpoint is accepted only when its origin
is exactly `https://api.chatcut.io`.

Images are uploaded without editorial modification. In local prototype runs,
videos are normalized to 30 fps H.264/AAC MP4 and audio is normalized to Ogg
Opus using `ffmpeg` and `ffprobe` found on `PATH`. The result is a bounded JSON
text document containing only ChatCut asset IDs and media kinds. Tokens,
endpoints, presigned URLs, and native paths are never returned or logged.

Build and test:

```sh
bun run typecheck
bun run test
bun run build:release:darwin-arm64
```

The generated prototype artifact begins with `#!/usr/bin/env convax-bun`;
compatible Convax hosts execute that script with the app-owned Bun runtime.
Passing validation and packing confirms package mechanics only; it does not
make this PATH-dependent prototype release-ready.

This implementation is original MIT-licensed code based on ChatCut's public
media-import protocol contract. It does not copy ChatCut's separately licensed
upload helper.

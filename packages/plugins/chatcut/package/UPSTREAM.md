# ChatCut configuration provenance

This package was independently authored for Convax after auditing the public
ChatCut Agent Plugin:

- repository: `https://github.com/ChatCut-Inc/agent-plugin`
- audited commit: `1b7dd43aa1572c6bfb7e6218d28919e2efc39c27`
- audited Codex package version: `0.2.20`
- audited files: `codex/.mcp.json`,
  `codex/.codex-plugin/plugin.json`, `codex/skills/asset-import/SKILL.md`,
  `codex/skills/asset-import/scripts/upload-media.mjs`, and `README.md`

The audited MCP configuration declares the hosted endpoint
`https://api.chatcut.io/api/external-mcp/mcp`, the static
`x-chatcut-mcp-surface: codex` header, and OAuth resource discovery for that same
endpoint. Convax represents those public configuration facts through the generic
`convax.plugin/6` remote MCP contribution. OpenCode performs the standard MCP
OAuth flow; this package contains no authentication implementation or credential.

The audited asset-import workflow documents a separate local-media boundary:
ChatCut's remote MCP creates a short-lived import session, then a local helper
uploads a bounded set of media with the returned token and endpoint. This package
represents that separation with the generic `media.import` operation backed by
the separately resolved `convax-chatcut-media-import-mcp` runtime. The Canvas
surface passes ordered node identifiers and media roles to the Agent; it does not
receive media bytes, native paths, the session token, or network access.

No source code, Skill text, logo, binary, FFmpeg build, media-upload helper, or
other asset from the upstream repository is included in this package. The local
runtime name and Convax operation envelope are independently authored integration
metadata, not a copy of the audited helper. The upstream package metadata declares
`GPL-3.0-only`, while the audited repository snapshot did not contain a root
`LICENSE` or `COPYING` file. Avoiding upstream content keeps this independently
authored package under its declared MIT license and avoids implying that Convax
republishes the official ChatCut package.

The Canvas workspace HTML, CSS, JavaScript, icons, copy, and workflow starters
were independently authored for Convax. They use only Convax's documented
`convax.plugin-capability/1` MessagePort contract and contain no upstream UI or
application code.

The `codex` surface header is retained because it is the public, tested value in
the audited configuration. A future release may use a ChatCut-approved `convax`
surface value without changing Convax core or the MCP transport.

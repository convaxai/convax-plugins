# Convax Plugins contributor contract

These rules apply to people and AI agents in this repository.

## Repository ownership boundary

- This repository is the authoritative source for concrete Convax Plugins,
  Plugin-owned Skills, standalone Skills, MCP Servers, reviewed companion tools,
  the Official Marketplace, and the immutable Builtin bundle.
- The `microvoid/convax` repository owns the generic host platform: manifest ABI,
  validation at installation, lifecycle, runtime bridges, IPC/UI, and Registry
  consumption. Do not copy its private implementation or create a package-specific
  host fork here.
- If an integration needs a missing host capability, add or revise the generic ABI
  in `convax` and keep the concrete manifest, assets, workflow instructions, and
  companion source in this repository. Neither repository may add runtime behavior
  that branches on the concrete Plugin id.

## Before editing

1. Read `README.md` and the relevant file in `docs/`.
2. Name the package or external tool being changed. A package owns only files below
   its own workspace; a separately distributed tool owns only `packages/tools/<id>`.
3. Never copy private Convax implementation code. Use only the documented manifest
   and compatibility protocol: `convax.plugin/1` through `/4` use the matching
   `convax.plugin-host/<major>`; `convax.plugin/5` and `/6` use
   `convax.plugin-capability/1`.

## Package rules

- Plugin, Skill, and MCP Server sources live under `packages/plugins/<id>`,
  `packages/skills/<id>`, and `packages/mcp-servers/<id>` respectively.
- MCP Server identity and version come only from the reviewed standard
  `server.json`. A fixed HTTPS server has exactly one supported remote and no
  `convax-mcp.json`. A managed-stdio server has no supported remote and uses the
  strict `convax.mcp-server-extension/1`; its target executable is always a
  separate immutable companion.
- Directories below `tooling/fixtures/mcp-servers/` are inert acceptance
  fixtures only. They are never Marketplace packages or workspaces.
- Every Plugin, Skill, and Tool directory is a Bun workspace with its own
  `package.json`, dependency declarations, and scripts. The repository owns one
  root `bun.lock`; do not add package-local lockfiles or hard-code workspace ids in CI.
- The contents of `package/`, not the containing directory, become the ZIP root.
- A `convax.plugin/1` Plugin requires static Web content. `convax.plugin/2` through
  `/6` may additionally declare a separately installed bare `mcp-stdio` command
  for executable contributions. Any schema may opt into one explicitly authorized,
  self-contained JavaScript ESM OpenCode Hook module through `hooks`; v2 and later
  may be Hook-only. Never put the MCP executable, a server, native binary, Electron,
  remote script, dependency tree, or install/build hook in the Plugin ZIP.
- A declared `hooks` module is executable code, not inert Web content. It must be
  one bundled, valid ESM `.js` or `.mjs` file with an exported OpenCode Plugin
  entry. Only static `node:`/`bun:` built-in imports may remain; bundle every package
  dependency and do not use CommonJS globals, runtime module loaders such as
  `node:module`, or dynamic imports. Convax binds consent to its exact bytes and
  loads a private snapshot only after an explicit install or update;
  default/background provisioning must not authorize new Hook bytes.
- Reviewed companion tool source may live under `packages/tools/<id>`, but it is a separate
  distributable with its own tests. Repository validation and Plugin packing never
  execute it or include it in `package/`.
- A `convax.plugin/4` or later Plugin may contribute Plugin-owned Skills from independent
  Skill workspaces. The packer injects them; do not commit a duplicate Skill below
  the Plugin `package/`. Convax lifecycle ownership is declared by the manifest and
  Registry metadata, never inferred from npm dependencies.
- A `convax.plugin/6` `contributes.agent.mcp` declaration names one absolute HTTPS
  remote MCP endpoint for OpenCode/the native host to connect. It is not a local
  command or sidecar declaration. Do not put credentials, secret/dynamic headers,
  local paths, or executable fallback behavior in it; service authentication stays
  with the remote service and the host's standard MCP OAuth flow.
- A published companion is declared in source metadata and emitted as a separate,
  target-specific Release asset. Its immutable Registry URL, byte size, and SHA-256
  are derived from the reviewed build output; never author them by hand.
- A Skill composes documented host capabilities. It must not claim capabilities,
  edit private `.convax` state, or ask users to bypass safety controls.
- Do not use symlinks, absolute paths, traversal, Windows-reserved names, generated
  dependency trees, secrets, or files larger than repository limits.
- Increment package SemVer whenever released bytes or catalog metadata change.
- The protected default branch publishes only packages whose identity version
  changed. Authors do not create release tags. Any tracked package byte change
  without an identity version change fails before privileged publication.
- Official Registry v2, its strict lossless v1 projection, Showcase v2, and the
  Builtin bundle are generated with `@convax/marketplace-kit`. Do not duplicate its
  schema parsers, deterministic ZIP writer, or Registry builder in this repository.
- `catalogs/builtin.json` contains only standalone Skill `canvas-storyboard` in
  the first bundle. `catalogs/preinstalled.json` contains only Official Plugin
  `ffmpeg-tools` for `darwin-arm64` with explicit setup. Neither membership grants
  execution authority.
- Treat `registry/config.json` sequence as the production sequence floor. Bump it for
  explicit catalog-policy changes such as yanking; ordinary package Releases advance
  the deployed sequence independently through the protected Pages workflow.
- A generation companion must not impose an arbitrary overall deadline after a
  vendor accepts a job. Bound individual status requests and keep canonical
  queued/running states alive until success, explicit terminal failure, or caller
  cancellation.

## Required verification

Run `bun install --frozen-lockfile --ignore-scripts`, trusted Plugin/Skill workspace
builds, `bun run validate`, workspace tests, `bun run build:companions`, `bun test`,
`bun run pack`, `bun run build:index`, Marketplace Kit `check`, Official v2/v1
build, and Builtin `bundle` before requesting review. Dogfood the real packed
`@convax/marketplace-kit` tarball in an isolated consumer until its exact version is
published; never commit an absolute `file:` override. The explicit package and
companion build phases finish before validation and packing. Validation and packing
themselves remain inert and never execute contributor-provided scripts. Tooling
treats package contents as inert bytes.

## Git discipline

- Use conventional messages such as `feat(plugin): add storyboard surface`.
- Do not commit `dist/`, credentials, local Convax state, or dependencies.
- Publishing happens only from protected workflows after CI succeeds.

## Security

Keep workflow permissions minimal and pin every Action to a full commit SHA. Do not
weaken validation, digest checking, iframe isolation, or scope enforcement to make a
package pass. Report vulnerabilities through `SECURITY.md`, not a public issue.

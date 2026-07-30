# Host capability request: verified companion dependency toolchain

Status: pending human review

## User problem

- Affected Plugin and version: `chatcut@0.3.2`; companion
  `convax-chatcut-media-import-mcp@0.1.1`.
- Current Catalog: `@convax/plugin-api@1.0.0`; canonical local Catalog JSON
  SHA-256
  `5647290670309c550c144b2746a17bc0fa0dd504484fb137952620896dc889e4`.
- Missing contribution point: a generic verified companion dependency bundle,
  or equivalent immutable multi-file toolchain, that resolves secondary
  executables without ambient `PATH`.
- Blocked workflow: ChatCut image import works inside the verified primary
  companion, but video and audio normalization currently launches `ffmpeg` and
  `ffprobe` resolved from inherited `PATH`. The Host authorizes neither binary's
  exact identity.

## Blocked Plugin use case

- Users import directly connected Canvas video or audio into ChatCut.
- Input is Host-staged bounded media; output is normalized H.264/AAC MP4 or
  Opus/Ogg plus bounded probe metadata used by the existing import operation.
- Immutable dependency selection, target matching, byte verification, private
  installation, and process-tree ownership are generic Host publication and
  lifecycle responsibilities. Plugin code cannot make arbitrary `PATH` programs
  trustworthy.
- Missing target bytes, digest mismatch, cancellation, companion replacement, or
  process-tree loss must fail closed without upload or partial publication.

## Catalog evidence

- Checked Catalog version: `@convax/plugin-api@1.0.0`, canonical JSON SHA-256 `5647290670309c550c144b2746a17bc0fa0dd504484fb137952620896dc889e4`.
- Closest existing APIs: none; this is an authoring, Registry, installation, and
  companion-launch contract rather than a Web or Agent callable API.
- Availability result: the current contracts admit one verified primary
  companion executable but not its immutable secondary executable closure.
- Why required/optional declaration does not solve it: `hostApi` controls callable
  Host APIs and cannot authorize or bind native toolchain files.

## Requested generic contract

- Proposed capability id or contribution: a versioned verified companion toolchain contract, for
  example `plugin.companion-toolchain/1`. The final name and shape require human
  review.
- Intended audiences: authoring Kit, Registry, Desktop Main, and the verified primary
  companion only; never `web-plugin` or `agent-skill`.
- Scope: one installed Plugin id/version, one platform/architecture target, and
  one immutable dependency closure.
- Side effect: installs verified executable bytes and later executes them only as
  children of the already authorized companion process tree.
- Required grant: no new implicit grant. Installation remains bound to explicit
  Plugin consent and the existing exact runtime authorization receipt.
- Bounded request: authoring metadata names a bounded set of logical dependency
  commands and target-specific immutable files. Publication generates sizes and
  SHA-256 digests. Runtime supplies opaque resolved executable bindings to the
  unchanged primary companion; the companion never supplies a path.
- Bounded response: either all declared dependency bindings resolve to the
  exact installed closure or the primary companion is not started. No native
  path crosses preload, renderer, Agent, or Plugin Web code.
- Stable errors: `target-unsupported`, `dependency-missing`, `dependency-changed`,
  `toolchain-incomplete`, `process-tree-unsupported`, and `reinstall-required`.
- Cancellation and stale-scope behavior: cancellation terminates the primary
  process tree and every dependency child. A changed Plugin snapshot, target,
  toolchain receipt, or executable identity invalidates the binding and fails
  closed. The next explicitly approved authoring and Registry contract version
  must own these rules; this is not a callable Host API.

## Alternatives considered

- Pure JavaScript media processing: avoids native dependencies but does not
  currently provide equivalent, bounded H.264/AAC/Opus decode, probe, and encode
  behavior. WASM/JS codec bundles would still need immutable publication, have a
  large size and memory footprint, and require a separate sandboxing review.
- Independent Host Tool capability: a generic Host-owned transcode/probe tool
  could remove native execution from the Plugin, but it creates a broader media
  API, scheduling, storage, cancellation, and product-policy surface. It should
  be chosen only if multiple products need the same Host-owned operation.
- Bundle a multi-file closure beside the primary companion: this is the narrowest
  functional option. It preserves Plugin-owned media semantics while extending
  existing verification and lifecycle rules from one executable to a bounded
  toolchain.
- Statically combine all behavior into one executable: possible on some targets,
  but it complicates FFmpeg licensing, upgrades, vulnerability inventory, and
  cross-platform builds and does not establish a reusable dependency contract.
- Keep ambient `PATH` or remove video/audio import: `PATH` is unverifiable and
  unsafe; deleting supported media silently regresses ChatCut. Neither is an
  acceptable release path.

## Security and authority

- Bind every dependency to the exact Marketplace source, Plugin id/version,
  companion version, platform, architecture, size, SHA-256, and publication
  receipt.
- Admit only a small declared command set and bounded total bytes/files. Reject
  symlinks, hard-link ambiguity, traversal, mutable install paths, partial
  closures, duplicate logical names, and unexpected executable files.
- Install into a private Host-owned versioned directory. Recheck identity before
  each primary launch and pass dependency bindings through a fixed private
  launch contract, not inherited `PATH`.
- Keep the primary companion as process-tree owner. Cancellation and disposal
  terminate the primary process and every toolchain child; unsupported ownership
  primitives fail closed.
- No dependency may gain network, Project, Canvas, credential, renderer, or Agent
  authority by being present in the closure. Existing staged-input and upload
  guards remain authoritative.
- Source refresh and background update cannot expand an existing receipt. Any
  byte, target, dependency-set, or version change requires a new reviewed release
  and authorization transition.

## Compatibility

- Older Hosts cannot admit the new toolchain contribution. The affected release
  remains blocked and must not fall back to `PATH`.
- Once approved, the dependency closure is required for ChatCut video/audio
  import; image-only success must not conceal a missing toolchain for other
  declared inputs.
- Registry and authoring Kit versions must reject unknown, partial, or mixed
  single-file/multi-file declarations instead of projecting them into an older
  schema.
- Rollback restores the last complete authorized Plugin and toolchain receipt.
  It never rewrites installed package bytes or retains orphan dependency files as
  executable authority.

## Falsifiable acceptance tests

1. Authoring and Registry generation deterministically include every target file,
  logical command, size, digest, and owning release identity.
2. Missing files, extra files, duplicate commands, traversal, symlinks, hard-link
  ambiguity, wrong modes, digest/size mismatch, oversized closure, unsupported
  target, and mixed versions fail before publication or installation.
3. Missing consent, wrong Plugin/version/source, stale authorization receipt, and
  background dependency expansion fail closed.
4. Launch gives the primary companion exactly the reviewed `ffmpeg` and `ffprobe`
  bindings while a hostile executable with the same names earlier on `PATH` is
  never selected.
5. Cancellation, crash, timeout, update, uninstall, and Host shutdown terminate
  both tools and leave no authorized orphan process or partial executable
  closure.
6. Cross-Plugin and cross-version dependency reuse is denied unless a future
  separately reviewed content-addressed sharing contract preserves independent
  authorization.
7. End to end, ChatCut imports one video and one audio input on every declared
  target with network/upload assertions proving no external side effect occurs
  before toolchain verification succeeds.
8. Existing single-file managed companions and remote MCP Plugins remain
  byte-for-byte behaviorally unchanged.

## Plugin-side plan after approval

- Replace ambient `Bun.which` resolution with the approved opaque dependency
  bindings while preserving ChatCut image, video, and audio import behavior.
- Declare only the released generic contract and exact target closure.
- Add package, runtime, cancellation, hostile-`PATH`, and cross-target tests in
  this repository; do not implement or patch Host behavior from this task.

## Human decision audit record

- Decision: pending
- Reviewer identity: pending
- Decision time: pending
- Protected receipt URL and SHA-256: pending
- Accepted published contract version and digest: pending
- Runtime conformance evidence: pending

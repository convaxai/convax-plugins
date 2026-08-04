# Plugin authoring

Convax publishes one authoring contract:

- source metadata is `convax.package/2`;
- Plugin manifests are `convax.plugin/8`;
- the runtime compatibility projection is derived by the Registry builder, never
  copied into source metadata.

Older schemas remain readable only as immutable Registry history. They are not
valid source candidates, templates, release selections, or new Release entries.

## Source publication state

`convax-package.json` contains portable package metadata only:

```json
{
  "schema": "convax.package/2",
  "kind": "plugin",
  "id": "example",
  "name": "Example",
  "description": "A bounded example Plugin.",
  "version": "1.0.0",
  "yanked": false
}
```

`registry/host-capability-policy.json` is the sole publication-policy owner.
Every pending request under `docs/host-capability-requests/` must appear there
with exact affected package versions. Each affected workspace must also list the
request id under `package.json#convax.hostCapabilityRequests`; tooling requires the
declaration and policy to match in both directions before deriving `publication:
{status:"blocked",blockers}` in memory. Missing policy, request document,
declaration, edited decision, or stale package version fails closed. The portable
package and runtime Registry never acquire this authoring policy.

`convax.hostCapabilityRequests` is a bounded set, not a single-choice field. One
exact `{kind,id,version}` may bind up to 16 independent requests when capabilities
are orthogonal. The policy parser rejects duplicates and over-bound sets, and
normalizes request and blocker ordering so input order cannot affect release
output. Authors must not merge unrelated requests merely to satisfy tooling.

Pending entries still require `status: "pending"` with `humanDecision: null`;
changing either field cannot unlock publication. Policy schema
`convax.host-capability-policy/2` additionally keeps append-only resolution
tombstones that point to external immutable receipt bytes. Each v2 request also
contains sorted `acceptedApiContracts`: exact API id and Catalog
`contract.digest` pairs, or an explicit empty list for a non-API request. The
protected verifier binds a receipt to that list, the request semantic digest,
affected package identities, exact published generic contract package/version,
Catalog SHA-256, Host PR/commit, and
strictly parsed `convax.plugin-api-runtime-conformance/1` evidence before the
dependency can be removed. The current conformance check set is closed, must be
all-passed, and must include the exact `plugin-asset-protocol.test.ts` CSP suite.
The Catalog, tarball, and conformance assets must each carry a
`<asset>.sigstore.json` keyless Sigstore bundle from the exact Host release
workflow and source revision. Protected verification requires Public Rekor
inclusion and binds the GitHub OIDC issuer, workflow, protected ref, source SHA,
trigger, GitHub-hosted runner, and pinned numeric GitHub repository and owner
identities. Both live GitHub metadata and Fulcio certificate claims must match
those numeric pins. The published npm tarball must be byte-identical to the
already verified Host immutable Release asset, carry the same name/version, and
contain the exact Catalog bytes. npm integrity is a consistency check, not an
independent publisher-provenance root. See
[`host-capability-resolution.md`](host-capability-resolution.md). Approval cannot
be self-authored in this repository.

Resolution is per request id. Each removed request needs its own exact resolution
tombstone and independently verified receipt; a receipt for one request never
unblocks sibling requests bound to the same package version. Publication becomes
eligible only after every blocker for that exact version is either still present
and reported or has passed its own protected receipt transition.

CI and release selection also compare the candidate with the exact protected-main
commit supplied by GitHub. A pending request id and each affected `{kind,id}` from
that base must remain pending across version bumps. Its normalized semantic core
also remains immutable: generated Catalog evidence may refresh, but the problem,
requested contract, authority, compatibility, falsifiable tests, and Plugin-side
plan cannot be replaced in place. Deleting all declarations or rewriting the
request therefore fails before release planning.

A new or renamed Plugin that uses only the published Catalog is an ordinary
Plugin-review decision, not a Host-change request. CODEOWNERS and protected-branch
review own that admission. Do not fabricate a missing Host capability merely to
make a new identity visible to CI.

Known gaps use the strongest reliable evidence available. A
`convax.pet-host/1` contribution is a validated Manifest fact, so tooling requires
the pending `sdk-owned-pet-surface-client` request regardless of how source code
spells its transport. By contrast, `canvas.inputs.open` is a valid published
audio/video stream API: its generated response contract admits only
`probe.kind: "audio" | "video"`. Declaring it does not imply image access and must
not be blocked. A Plugin that needs image bytes must stop and declare
`web-plugin-image-input-read`; it cannot reinterpret the audio/video result or
request a Host edit. The three known image consumers already carry that explicit
dependency, and protected request history prevents them from deleting it through
a business-code rewrite. Tooling does not pretend static source inference can
prove an arbitrary Plugin's media intent.

`.github/CODEOWNERS` assigns the checker, policy, requests, authoring Skill, Plugin
source, and workflows to a human owner. Publication declares the protected
`plugin-marketplace-production` environment; Host decisions use the separate
`plugin-host-capability-governance` environment. The remote ruleset must require
that human code-owner, dismiss stale approvals, reject bot approval, require the
protected-base governance check, prevent Environment self-review and administrator
bypass, and enable immutable Releases. Local source text cannot prove those
external settings or reviewer identity.

## Host API declaration

Every v8 manifest explicitly declares the Host API catalog major and its required
and optional API ids:

```json
{
  "schema": "convax.plugin/8",
  "id": "example",
  "name": "Example",
  "description": "A bounded example Plugin.",
  "version": "1.0.0",
  "entry": "index.html",
  "hostApi": {
    "major": 3,
    "required": ["host.context.get"],
    "optional": []
  },
  "capabilities": [],
  "contributes": {
    "canvas": {
      "renderer": { "create": true, "width": 640, "height": 400 }
    }
  }
}
```

A Plugin with `entry` must require `host.context.get`; the negotiated profile and
availability query are exposed through that connection API. A pure headless Tool,
Hook, Pet, or remote MCP Plugin still declares
`{"major":3,"required":[],"optional":[]}` and must not claim Web-only APIs.

`hostApi` is an availability/compatibility declaration. Existing capability
grants remain the authority request. Declaring an API does not bypass permission,
scope, live context, setup, transition, or installed-byte checks.

Web author source imports `createPluginHostClient` from
`@convax/plugin-sdk/client`. The package build bundles that client and a minimal
browser-safe manifest projection into `package/assets/plugin-host-client.js`;
the immutable package never relies on a bare package import at runtime. The
projection retains `hostApi` and inter-Plugin capability imports, but excludes
Agent MCP endpoints, Skills, executable runtimes, services, and unrelated UI
contributions. Do not hand-edit the generated asset or implement request ids,
pending maps, protocol envelopes, `MessagePort.postMessage`, response parsing, or
cancellation beside the SDK. Run both `bun run build` and
`bun run build:check` before publishing.

The build marker is not supply-chain proof. Protected publication separately
requires the committed root lock to resolve the SDK and API from exact npm
tarballs, verifies their immutable Host Releases and per-asset keyless Sigstore
bundles against Public Rekor and immutable GitHub identity claims, checks the
actual installed resolver directories against those tarballs, and emits
`convax.plugin-bundle-provenance/1` for the final Plugin ZIP.
Workspace, file, Git, alternate-registry, mutated-lock, missing-network-evidence,
or reused-version inputs fail closed. This package evidence is independent from
Host capability requests and can never approve a missing API.

## Canvas commands and placements

A v8 Web Plugin defines each Canvas UI command exactly once in `commands`.
`toolbar` and `menus` contain placement records that reference those definitions:

```json
{
  "contributes": {
    "canvas": {
      "renderer": {
        "create": true,
        "width": 640,
        "height": 400
      },
      "commands": [
        {
          "id": "context.refresh",
          "title": {
            "default": "Refresh context",
            "zh-CN": "刷新上下文"
          },
          "icon": "refresh",
          "target": {
            "type": "renderer-message",
            "message": "renderer.context.refresh"
          }
        }
      ],
      "toolbar": [
        {
          "id": "context-refresh-toolbar",
          "command": "context.refresh",
          "order": 10
        }
      ],
      "menus": [
        {
          "id": "context-refresh-menu",
          "command": "context.refresh",
          "placement": "overflow",
          "group": "context",
          "order": 10
        }
      ]
    }
  }
}
```

The Host owns presentation and placement:

- `title`, optional `icon`, and `target` belong only to a command. Supported
  Host-rendered icon tokens are `download`, `edit`, `open`, `play`, `refresh`,
  `settings`, `sparkles`, and `upload`; Plugins cannot contribute SVG, HTML,
  URLs, React components, or platform-native icon names.
- A command target is only
  `{"type":"renderer-message","message":"<bounded-message>"}`. Activation sends
  that message to the exact live owning renderer frame as a
  `convax.plugin-host/8` message with `type: "command"`. This envelope is owned
  by `@convax/plugin-sdk/client`; it cannot name a
  Host function or another Plugin, and it grants no Host API authority.
- Toolbar records contain only `id`, `command`, and optional `order`. Menu
  records add the required `placement: "overflow"` and optional `group`; menus
  are limited to the owning Canvas node overflow.
- Command ids, placement ids, and references are stable Plugin-local ids.
  Placement ids are unique across both surfaces, every reference resolves to a
  command, and a surface cannot reference the same command twice. One command
  may appear once in each surface.
- Commands and placements require a declared sandbox renderer. Inline legacy
  toolbar or menu definitions are not accepted, and placements cannot override
  command presentation or behavior.

The renderer handles the declared message through the SDK client:

```js
const unsubscribeCommands = client.onCommand(({ command }) => {
  if (command === "renderer.context.refresh") void refreshContext()
})

window.addEventListener("pagehide", () => {
  unsubscribeCommands()
  client.close()
})
```

## Declarative Tool Plugins

A headless v8 Tool Plugin declares a separately published `mcp-stdio` runtime and
one or more generic generation, service, LLM, Agent-tool, or inter-Plugin
capability contributions. The Plugin ZIP remains inert; companion bytes are
published, verified, and authorized independently.

`generation.tools` is the executable operation catalog.
`generation.models` is a separate display catalog and may be empty for utilities.
A companion that discovers a live model catalog may mark exactly one required
top-level bounded string selector in `tools/list.inputSchema` with
`"x-convax-role": "generation-model-id"`. The selector must contain explicit
bounded choices. If a model-driven tool cannot return that bounded catalog, omit
the tool from `tools/list`; do not expose a provider model id as an ordinary
free-text fallback. Missing or malformed runtime catalog data fails closed.

A generic image operation can be placed directly on selected image nodes:

```json
{
  "contributes": {
    "generation": {
      "models": [],
      "tools": [
        {
          "id": "background.remove",
          "title": "Remove background",
          "description": "Create one transparent image from the selected source.",
          "output": "image",
          "acceptedInputs": ["reference_image"]
        }
      ]
    },
    "canvas": {
      "selectionActions": [
        {
          "id": "remove-background",
          "title": { "default": "Remove background" },
          "description": {
            "default": "Create a transparent image beside the source."
          },
          "target": "image",
          "editor": "immediate",
          "presentation": "cutout-scan",
          "steps": [{ "tool": "background.remove" }]
        }
      ]
    }
  }
}
```

The action has exactly one step. Its referenced tool is a non-model, non-return
operation that accepts `reference_image` and outputs `image`. The Host preserves
the selected source, creates the adjacent pending result, owns the fixed
`cutout-scan` lifecycle on that result, and replaces only the guarded pending
node. The Plugin never receives Canvas DOM access and the Host never branches on
the concrete Plugin id.

## Missing Host capabilities

Use the standalone `convax-plugin-authoring` Skill whenever creating, modifying, or
debugging a Plugin. Before adding a Host call, inspect the generated Catalog
supplied by the build or release environment and verify its exact id, `since`,
`audience`, grant, scope, side effect, errors, and documentation. Runtime
negotiation then uses the availability profile returned by `host.context.get`.

Plugin development never authorizes changes to the Host repository. If the Catalog
does not contain the required generic API or contribution point:

1. do not reuse a legacy protocol, invent an undeclared method, inspect Host private
   code, or switch to `../convax`;
2. mark the affected package `blocked` with a structured
   `host-capability-review-required` blocker;
3. copy the Skill's
   `references/host-capability-request.md` template into this repository and fill
   in the problem, use case, requested generic capability, alternatives,
   security/scope/side effect, compatibility, and acceptance tests;
4. stop Host-dependent implementation until a human approves a generic contract
   and a newly generated Catalog contains it.

Human approval starts a separate Host-owned task; it is not implicit permission for
the Plugin authoring task to edit Host code.

## Plugin-owned Skills

Owned Skills are authored once under `packages/skills/<name>/package`. The Plugin
declares the injection path and the subset used by the Skill:

```json
{
  "name": "example-workflow",
  "path": "skills/example-workflow",
  "uses": {
    "pluginTools": ["inspect_media"]
  }
}
```

`uses` and each child list are optional, but an included `uses` object must name at
least one capability. A required Skill API must be required by top-level `hostApi`;
an optional Skill API may be in either top-level list. Every Skill API must have
`agent-skill` audience in the catalog exported by the installed
`@convax/plugin-api`. Web-only APIs must never appear in an Agent Skill.
`pluginTools` names lower_snake_case Agent tool ids from
`contributes.agent.tools`; the SDK renderer resolves those aliases to their
underlying Plugin tool descriptions while runtime `tools/list` remains
authoritative.

Check the owned Skill declarations and stable links before build:

```sh
bun run skill-api:check
```

`SKILL.md` contains stable links to `references/convax-capabilities.md` and
`references/plugin-capabilities.md`. Both paths are reserved: do not author or
check in either file. `@convax/marketplace-kit` injects the deterministic bytes
from `@convax/plugin-api` and `@convax/plugin-sdk` while building the Skill and
owner Plugin artifacts. The Host API page records the SDK catalog version,
`since`, availability guidance, and declared Plugin tools. The Plugin capability
page records required and optional imports, version intervals, and exported
operation schemas.

Generated reference bytes participate in both the Skill artifact and owner Plugin
snapshot digest. Host upgrades never rewrite an already installed Skill in place.

## Package boundary

The contents of `package/` become the immutable ZIP root. A Web surface runs in an
opaque-origin `sandbox="allow-scripts"` iframe. A declared Hook is a separately
authorized self-contained ESM module. Local executable runtimes and their
dependencies remain separate verified companions; they never enter the Plugin
ZIP.

Web entry documents and every HTML/CSS/JavaScript subresource must use portable
relative URLs. The Host binds the exact immutable Plugin snapshot into the
document origin. Root-relative, absolute, Plugin-id-derived, or version-derived
asset URLs do not carry that identity and fail closed instead of resolving against
the current installation.

Concrete integrations stay in this repository. Runtime behavior derives only from
validated contributions and Host API declarations, never from a concrete Plugin
id.

## Verification

Run source admission normally:

```sh
bun run validate
```

Validation and Marketplace preflight admit policy-consistent blocked source and
report it explicitly. Exact packing rejects a blocked target. Release selection and
Marketplace composition omit blocked exact versions and their owner/owned-Skill
closure while continuing with unrelated ready packages. A package can move from
`blocked` to `ready` only through a future protected receipt verifier bound to the
published contract, Catalog digest, runtime conformance, and a new package version.

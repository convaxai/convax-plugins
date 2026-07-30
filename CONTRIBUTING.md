# Contributing

Thanks for improving the Convax capability catalog.

## Add a package

1. Copy the closest directory under `templates/` into the matching `packages/`
   collection. Use one kebab-case id everywhere.
2. Keep dependencies and contributor scripts in that workspace's `package.json`.
   Run one root `bun install`; do not add a package-local lockfile. If a build is
   required, make `build` emit the complete self-contained `package/` tree.
3. Fill in the current `convax.package/2` metadata. It contains no publication
   field; `registry/host-capability-policy.json` is the sole policy owner. Plugin
   manifests use only `convax.plugin/8`; keep id, name, description, and version
   equal across both files.
4. Implement static, self-contained files below `package/`. Runtime CDN imports and
   remote scripts are rejected because a Plugin must remain reviewable offline.
5. Request the smallest capability and `hostApi` sets. Verify every Host API id,
   `since`, audience, grant, scope, side effect, error, and availability against
   the generated Catalog. A Web Plugin with `entry` requires
   `host.context.get`; a headless Plugin keeps an explicit empty declaration.
6. For a Plugin-owned Skill, declare the v8 `{name,path,uses?}` contribution.
   Author the Skill in its own workspace and let the packer inject it; never copy
   the Skill workspace or generated capability references into the Plugin tree.
7. Run `bun run check` and inspect the generated ZIP listing. Changing a Plugin-owned
   Skill changes its owner Plugin ZIP too, so bump and release both package versions.
8. Open a `convax-plugins` PR describing behavior, capabilities, manual tests,
   handled data, and any unresolved publication blocker.

## Missing Host API human gate

Plugin work does not authorize Host changes. If the generated Catalog or current
SDK lacks a required generic capability:

1. stop Host-dependent implementation and mark the affected package blocked;
2. create
   `docs/host-capability-requests/<kebab-case-slug>.md` from the
   `convax-plugin-authoring` Skill template;
3. add the request id to every affected workspace's
   `package.json#convax.hostCapabilityRequests` and bind each exact package
   version in `registry/host-capability-policy.json`;
4. submit only that implementation-neutral request for explicit human review;
5. do not edit, branch, commit, push, or open a PR in the Host repository.

Only explicit human approval may start a separate Host-owned task. The Plugin task
remains blocked until the approved contract is released in the generated Catalog;
writable sibling repositories or a shared Agent session do not waive this gate.
Editing `humanDecision`, deleting the policy, or deleting both a request and its
policy entry does not release an explicitly declared dependency. The request
semantic core is protected across commits, and new or renamed Plugin identities
do not reset an existing package's obligation. A new Plugin using only published
Catalog APIs goes through ordinary protected CODEOWNERS review and must not invent
a Host request. `convax.pet-host/1` is a Manifest-visible missing SDK surface and
is therefore gated automatically. `canvas.inputs.open` is a legal audio/video
stream contract, not an image API; a Plugin needing image bytes must explicitly
submit the pending image-input request rather than reinterpret the result or edit
Host code.
Unblocking additionally requires a protected decision receipt bound to the exact
released generic contract version, Catalog digest, and runtime conformance
evidence. Remote branch rules must enforce the repository CODEOWNERS and the
protected production environment; repository text cannot self-certify a human.

## Review checklist

- Metadata is accurate, consistent, and uses valid SemVer.
- Static assets are locally included and license-compatible.
- There is no secret, tracker, remote executable, native binary, or hidden network
  dependency.
- Web assets accept the transferred port through the bundled
  `@convax/plugin-sdk/client` only; they do not construct Host request envelopes,
  call the port directly, or implement a second response parser.
- Disconnected and failure states remain usable.

Maintainers publish with the exact tag described in `README.md`. A released version
is immutable. Corrections require a new version; compromised versions are marked
`yanked` rather than replaced.

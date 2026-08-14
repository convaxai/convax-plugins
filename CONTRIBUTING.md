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

## Missing Host contract

Plugin work does not authorize Host changes. If the generated Catalog or current
SDK lacks a required generic capability:

1. stop Host-dependent implementation and mark the affected package blocked;
2. describe the generic requirement with the `convax-plugin-authoring` Skill's
   `references/host-contract-requirement.md` template;
3. add the request id to every affected workspace's
   `package.json#convax.hostCapabilityRequests` and bind each exact package
   version in `registry/host-capability-policy.json`;
4. keep an explicit technical blocker while the contract is absent;
5. do not edit, branch, commit, push, or open a PR in the Host repository from
   this Plugin task.

A separate Host-owned task may add only the generic contract. Once the generated
Catalog contains it, bind the exact API digest as a `catalog-contracts`
requirement and remove the technical blocker. Validation then makes the package
ready automatically. Do not add `humanDecision`, approval receipts, CODEOWNERS
gates, or approval Environments. A new Plugin using only published Catalog APIs
must not invent a requirement. `canvas.inputs.open` remains an audio/video stream
contract; image consumers use the published `canvas.inputs.image.open`/`close`
contracts.

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

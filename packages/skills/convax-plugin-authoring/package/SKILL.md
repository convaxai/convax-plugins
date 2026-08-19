---
name: convax-plugin-authoring
version: 0.1.4
description: Create, modify, or debug a Convax Plugin. Use for Plugin manifests, Web assets, contributions, owned Skills, companion integration, Host API availability, protocol failures, and missing generic Host-contract design in a Convax Plugin repository.
---

# Convax Plugin Authoring

Keep concrete integration work in the current Plugin repository. Treat the
installed `@convax/plugin-api` Catalog as the only authoring-time Host API
authority and `@convax/plugin-sdk` as the authoring ABI.

1. Read the repository contract, Plugin manifest, publication policy, and exact
   SDK/API versions used by validation and release.
2. For every Host call, verify the API id, Catalog major, `since`, audience,
   grant, scope, side effect, errors, and documentation. Declare required and
   optional APIs precisely in `hostApi`. Negotiate optional APIs through
   `host.context.get` and fail closed when a required API is unavailable.
3. Use `createPluginHostClient` from `@convax/plugin-sdk/client` for Web
   Plugins. Use portable relative asset URLs. Never construct protocol envelopes,
   call the transferred port directly, inspect Host private code, or invent a
   legacy fallback.
4. Follow the generated result contract literally. Do not reinterpret one API as
   a broader capability: image input uses
   `canvas.inputs.image.open`/`canvas.inputs.image.close`, while
   `canvas.inputs.open` remains an audio/video stream API.
5. If a required generic contract is absent, stop only the dependent
   implementation. Stay in the Plugin repository and write a bounded requirement
   with [the Host contract template](references/host-contract-requirement.md).
   Add its id to each affected workspace's
   `package.json#convax.hostCapabilityRequests` and bind the exact package
   versions in `registry/host-capability-policy.json`.
6. Record an actual missing contract or unverifiable runtime dependency in the
   policy's technical `blockers`; never substitute a human approval queue.
   Host implementation belongs to a separate, generic Host task and must not
   branch on the concrete Plugin id.
7. When the generated Catalog contains the contract, bind its exact
   `contract.digest` with `verification: "catalog-contracts"`, remove the
   resolved technical blocker, and rerun validation. Use
   `verification: "package-conformance"` only when public package/manifest
   validation—not a Host API id—is the complete evidence.
8. Let protected CI publish every ready exact closure automatically. Do not add
   CODEOWNERS approval, decision receipts, approval Environments, or local
   exceptions. Immutable Releases, exact artifact hashes, frozen dependency
   resolution, Host package provenance, and owner/owned-Skill closure checks
   remain fail-closed.
9. For Plugin-owned Skills, keep the two stable generated-reference links but
   never author `references/convax-capabilities.md` or
   `references/plugin-capabilities.md`. Marketplace Kit injects those files so
   their exact bytes participate in the Skill and owner Plugin digests.

Finish by running the repository's focused package tests, structural validation,
SDK reference checks, packing, and Marketplace preflight. Report any remaining
technical blocker explicitly.

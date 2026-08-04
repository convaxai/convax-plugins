# Protected Host capability decisions

A Host capability request can leave `pending` only through an external receipt.
Approval text, a policy edit, a pull-request review, and a locally generated JSON
file are not receipts. The trust root is a GitHub-protected default-branch
workflow, an independently reviewed Environment deployment, two immutable
releases, keyless Sigstore certificates with Public Rekor inclusion for private
Host assets, and a GitHub build-provenance attestation for the public decision
receipt.

## Ownership and trust boundary

- `convax-plugins` owns the request, affected package identities, resolution
  tombstone, verifier, and Plugin migration.
- `convax` owns the generic runtime implementation, the published
  `@convax/plugin-api` Catalog, and runtime conformance evidence.
- `plugin-host-capability-governance` is a dedicated GitHub Environment. It must
  have named required reviewers, prevent self-review, disallow administrator
  bypass, and admit only protected `main`.
- Release immutability must be enabled for both `convaxai/convax` and
  `convaxai/convax-plugins`. A normal mutable Release is rejected even when its
  current SHA-256 happens to match.
- `Host capability governance / protected-base` must be a required check. It runs
  on `pull_request_target`, executes the verifier from the exact protected base,
  and treats the candidate checkout only as data. A candidate change cannot
  replace the checker that judges that same change.

These settings are remote controls. Repository text cannot establish that they
are enabled.

## Receipt issuance

After the Host PR is merged, publish one immutable Host Release whose tag resolves
to the exact Host commit. It must contain:

1. the generated `plugin-api.json` for one stable
   `@convax/plugin-api` version;
2. the exact npm package tarball containing that same Catalog; and
3. bounded runtime conformance evidence for that exact Catalog and Host commit.

The Catalog asset and the copy embedded in the package must use exactly
`convax.plugin-api-catalog/3`. Any other Catalog schema fails issuance and later
receipt verification.

For an API-backed request, the protected
`convax.host-capability-policy/2` request carries a sorted
`acceptedApiContracts` list of exact `{id,digest}` pairs. Non-API requests carry
an explicit empty list. The decision receipt repeats that list, and both issuance
and protected-base verification require every named API to exist in the exact
Catalog with the same `contract.digest`. A whole-Catalog SHA-256 is necessary but
not sufficient: an empty Catalog, a renamed API, or a same-id contract change
fails even when all surrounding release bytes and attestations are internally
consistent.

The only protected-history exception is the one-time
`convax.host-capability-policy/1` to `/2` cutover. Because `/1` could not represent
accepted API contracts, that transition may bind a non-empty exact contract list
and update the same still-pending request document to describe it. It cannot
remove the request or any affected package. Once `/2` is on protected `main`,
neither the accepted list nor the request semantics can change without the normal
externally verified receipt transition.

Runtime evidence is not trusted as an opaque digest. It must use exactly
`convax.plugin-api-runtime-conformance/1` with no unknown or missing keys and bind
`convaxai/convax`, the exact release commit, the protected
`plugin-api-release.yml@refs/heads/main` workflow and positive run identity,
the exact `@convax/plugin-api` version, Catalog `/3` digest, package tarball digest,
and npm integrity. Its check set is closed: `plugin-api-typecheck`,
`plugin-api-test`, `plugin-api-compat`, `plugin-api-generate-check`,
`plugin-api-pack-check`, `release-evidence-policy`, and
`host-runtime-conformance` must each occur exactly once with the exact command and
`passed` status. The runtime check must carry the exact Host suite list, including
`plugin-asset-protocol.test.ts`; evidence that omits the iframe CSP projection test
is rejected.

All assets are addressed by SHA-256. The
`Issue protected Host capability decision` workflow on protected `main` accepts
the pending request id, exact `convaxai/convax` identity, merged PR, release
commit/tag, Catalog version/digest, and conformance asset/digest. The protected
job:

- proves the Host PR is merged and contained by the released commit;
- runs `gh release verify` and `gh release verify-asset` for the Host Release,
  Catalog, npm tarball, and runtime evidence;
- requires a paired `<asset>.sigstore.json` bundle for the Catalog, package
  tarball, and runtime evidence and runs `cosign verify-blob --bundle` with
  default transparency-log verification against
  `convaxai/convax/.github/workflows/plugin-api-release.yml`,
  `refs/heads/main`, the exact Host commit, `workflow_dispatch`, the
  GitHub OIDC issuer, and a GitHub-hosted runner;
- emits and validates a canonical `convax.host-sigstore-verification/1` evidence
  manifest for each asset. In addition to Cosign's cryptographic checks, the
  verifier reads bounded Fulcio certificate extensions and binds the immutable
  `convaxai/convax` repository id `1322708874` and `convaxai` owner id
  `312877127`. Both the live GitHub repository metadata and the certificate OID
  claims must match these compiled pins. Repository names alone are insufficient
  because names can be reused;
- fetches the same npm version from `registry.npmjs.org`, verifies npm SHA-512
  integrity, requires byte-for-byte tarball equality, validates package
  name/version, and requires its embedded `dist/generated/plugin-api.json` to
  equal the standalone Catalog;
- queries the GitHub Environment and workflow-review APIs, rejects missing
  required reviewers, self-review, bot review, and administrator bypass;
- binds the protected request semantic SHA-256 and every affected package
  identity, accepted API id, and accepted contract digest;
- attests the receipt with the exact default-branch workflow identity; and
- publishes the receipt through a draft-then-publish immutable Release, then
  verifies that Release and asset again.

The workflow intentionally fails when either repository has not enabled immutable
releases or when the Environment is not protected. It does not create a local
approval fallback.

## Resolution pull request

A later Plugin PR may migrate to the published API and replace the pending request
with one `convax.host-capability-policy/2` resolution tombstone:

```json
{
  "id": "example-request",
  "receipt": {
    "repository": "convaxai/convax-plugins",
    "releaseTag": "host-capability-decision-v1-example-request-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "asset": "example-request.decision.json",
    "sha256": "<64 lowercase hex characters>"
  }
}
```

That PR may remove the request document and workspace declarations only when the
protected-base checker can:

- download the named receipt from the exact authority repository;
- match the policy SHA-256, base request semantic digest, affected identities,
  accepted API contract list, current Catalog bytes and version;
- require each accepted API id to exist in that Catalog with its exact
  `contract.digest`;
- verify that the decision Release is immutable and that the local receipt is its
  exact asset; and
- verify the separate build-provenance attestation with signer workflow
  `.github/workflows/approve-host-capability.yml`, source ref
  `refs/heads/main`, exact source commit, and a GitHub-hosted runner.

Resolution tombstones are append-only. Future PRs cannot remove or rewrite them.

One package version may be affected by several orthogonal pending requests. Each
request keeps a separate semantic digest, accepted-contract list, decision
Release, tombstone, and receipt verification. A resolution PR may resolve any
subset, but every unresolved request remains in both the workspace declaration and
policy and continues to block publication. One receipt never authorizes removal
of another request, and requests must not be merged to bypass this rule.

## Separate Plugin SDK provenance boundary

This decision receipt proves the Host API package, Catalog, runtime and accepted
API contracts. It does not prove the provenance of `@convax/plugin-sdk`.
`@convax/plugin-sdk/client` imports request/result validators from
`@convax/plugin-api`, and the Plugin repository bundles both packages into Web
assets. Therefore an API receipt alone must not be interpreted as authority to
consume arbitrary SDK bytes.

The target npm closure is `convax.host-package-release/1` with profile
`convax.plugin-sdk-authoring-package/1`: one immutable npm-identical SDK tarball
signed keylessly by the protected Host `plugin-sdk-release.yml` with a paired
Sigstore bundle and Public Rekor inclusion, bound to its exact Host commit and its
release-time Plugin API package/Catalog identity. Until those npm and Host Release
assets exist, publication uses a bounded workspace-delivery exception:
`convax.vendored-host-package-closure/1` binds the protected Plugin commit,
frozen lockfile, exact package versions and workspace resolutions, Catalog
digest, and all vendored Host package bytes. That exception is package provenance
only and has no role in capability resolution. After npm migration, the final
`convax.plugin-bundle-provenance/1` statement again binds the npm closure, source
manifest and build entrypoints, and exact emitted Plugin ZIP.

SDK proof is never part of request resolution and never grants a Host capability.
The capability decision continues to require the independent runtime conformance
receipt and exact accepted API contract digests. Tooling and the protected-base
workflow reject any attempt to teach the capability-receipt verifier about the SDK
Host package manifest.

## Local versus protected verification

Local tooling can validate policy/receipt structure, semantic digests, Catalog
bytes, explicit SHA-256 bindings, and the structure and certificate claims of a
downloaded Sigstore bundle for diagnosis. Those checks alone do not prove the
signature, current Public Rekor state, remote Environment, or immutable-Release
state and cannot authorize resolution.

Only the protected online check is authoritative. It queries GitHub and executes
`gh release verify`, `gh release verify-asset`, and pinned Cosign v3.0.6
`verify-blob --bundle` for private Host assets. It does not use the insecure
transparency-log or certificate-transparency bypasses. The later public decision
receipt continues to use GitHub build-provenance attestation and
`gh attestation verify`; that trust path is intentionally unchanged. Network
failure, missing evidence, an expired credential, a mutable Release, an absent
Rekor inclusion proof, or an unrecognized signer fails closed.

The npm registry does not provide the Host workflow identity used by this
governance chain. SHA-512 SRI and byte equality prove integrity and mirroring, not
who produced the package. The per-asset Host Sigstore bundle is therefore the
origin trust chain; npm may only match its verified bytes.

The current `web-plugin-image-input-read` request remains pending until the Host
contract is merged, its exact Catalog and conformance evidence are published, and
a human approves this workflow. No receipt is inferred from the implementation
branch or from this document.

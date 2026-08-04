# Host capability request: Web Plugin generation input binding

Status: pending human review

## User problem

- Affected Plugins and source versions: `jianying-editor@3.0.0`,
  `multi-angle@0.2.0`, and `relight-studio@0.2.0`.
- Checked Catalog: `@convax/plugin-api@2.0.0`, schema
  `convax.plugin-api-catalog/3`.
- Released-authority mismatch: `canvas.inputs.list` deliberately returns only an
  opaque `inputKey`, while the prior generation contract required a `nodeId`.
  Treating the opaque key as a Canvas node id was an invalid hidden assumption.
- The local API 2 development Catalog corrects that shape, but it is not
  publication authority until the protected receipt binds the exact contract.

## Blocked Plugin use case

- A Web Plugin selects one directly connected image through
  `canvas.inputs.list`, previews it through the separately governed image
  session APIs, and then submits that exact input as a generation reference.
- The Plugin must not learn or reconstruct a Canvas node id, native path, resource
  hash, or Host implementation detail.
- Edge, resource, revision, caller, cancellation, and stale-scope checks remain
  Host-owned immediately before the external generation call.

## Catalog evidence

- Checked Catalog version: `@convax/plugin-api@3.0.0`, canonical JSON SHA-256
  `e49ca2713fb66fef5d52b8d85735c68341a1f1d0390379f8ccef2d3d3434a45f`.
- Closest existing APIs: `canvas.inputs.list`, `canvas.inputs.image.open`, and
  `generation.execute`; `canvas.inputs.list` returns pathless descriptors keyed
  by `inputKey`.
- Availability result: the mechanically vendored API 2 candidate accepts
  `references: [{ inputKey, role }]`, with `since: 1.0.0`,
  `contractSince: 2.0.0`, and contract digest
  `sha256:a7ec11a6894247ae4485414a82a8a409f618d00bf3206e973ab111d4e7fa8247`.
- Why required/optional declaration does not solve it: declaring
  `generation.execute` negotiates only an already-published contract; it cannot
  approve candidate bytes or let `canvas.inputs.image.open` bearer possession
  grant generation authority.
- `acceptedApiContracts` binds the exact generated candidate digest while the
  request and all affected versions remain pending. Local bytes do not approve
  the contract or replace the protected Host release and human decision receipt.

## Requested generic contract

- Proposed capability id or contribution: correct the API 2
  `convax.plugin-api-wire-schema/3` `generation.execute.references[]` item to
  `{ "inputKey": "<opaque direct-input key>", "role": "<declared role>" }`;
  keep `generation.execute` as the API id because this is a breaking correction
  within the unpublished API 2 cutover, not a Plugin-specific method.
- Intended audiences: `web-plugin`.
- Scope: the exact installed Plugin principal and owning Canvas node connection.
- Side effect: unchanged `execute`.
- Required grant: unchanged `generation.execute`; image-preview grants do not
  imply it.
- Bounded request: accept at most the Catalog-defined number of unique
  `{ inputKey, role }` references plus the existing bounded prompt, output,
  result mode, and tool id; reject `nodeId`, paths, URLs, session ids, unknown
  fields, unrelated keys, duplicate bindings, and unsupported roles.
- Bounded response: retain the existing bounded generation result and never
  return the resolved Canvas node identity, native path, or staged resource.
- Stable errors: retain the published generation errors and use
  `stale-context`, `permission-denied`, and `resource-unavailable` for invalidated
  authority or resources without exposing private diagnostics.
- Cancellation and stale-scope behavior: resolve each key only against the
  caller's current direct incoming inputs, bind caller and resource revisions,
  propagate cancellation, and revalidate the exact edge and resource immediately
  before execution; cancellation or staleness before the billable boundary
  prevents execution.

## Alternatives considered

- Expose `nodeId` from `canvas.inputs.list`: rejected because it widens a
  pathless capability into Canvas structure disclosure and encourages callers to
  retain stale authority-shaped identifiers.
- Add an `inputKey -> nodeId` mapping API: rejected because it creates a reusable
  identity leak and a confused-deputy surface with no Plugin need.
- Reuse the image bearer URL or session id: rejected because preview possession
  is not generation consent and the session is revoked promptly after decode.
- Omit references and infer an arbitrary connection: rejected because multiple
  direct inputs require an explicit, stable caller selection.

## Security and authority

- Bind every key to the caller snapshot, frame, Project, Canvas, owning node,
  direct edge, source resource identity, and current media revision.
- Reject caller-supplied node ids, paths, URLs, session ids, unrelated keys,
  duplicate bindings, unsupported roles, stale edges, and changed resources.
- Revalidate after asynchronous preparation and immediately before a billable
  call. Cancellation before that boundary must prevent execution.
- The callee receives only the Host-staged resource permitted by the selected
  generation tool contract; no identifier or native path crosses renderer IPC.

## Compatibility

- API major 1 packages remain unsupported by the API 2 flag day and are not
  reinterpreted.
- API 2 packages using the corrected reference shape remain publication-blocked
  until the generated Catalog, SDK parser/client, runtime conformance evidence,
  and protected external decision receipt agree on one exact digest.
- Rollback removes the new Plugin versions; it never treats an opaque key as a
  node id or falls back to private IPC.

## Falsifiable acceptance tests

1. Generated Catalog and SDK accept only `{ inputKey, role }` for
   `generation.execute.references[]` and reject `nodeId`.
2. A current opaque key for one direct incoming image reaches the existing
   generation executor without exposing its resolved Canvas identity.
3. Wrong Plugin/frame/Project/Canvas/node, unrelated or malformed key, removed or
   replaced edge, changed media revision, duplicate reference, and unsupported
   role fail before external execution.
4. Cancellation and stale scope after preparation but before the billable
   boundary produce no external call and no Canvas mutation.
5. Preview-session possession alone cannot authorize generation, and closing the
   preview session neither invalidates nor broadens the separately revalidated
   generation request.
6. Jianying Editor, Multi Angle, and Relight Studio packed assets contain no
   `nodeId` reference workaround and submit only opaque keys returned by their
   current input list.

## Plugin-side plan after approval

- Persist only the selected opaque input key plus harmless revision/dimension
  metadata; never persist a resolved Canvas identity or bearer URL.
- Submit `{ inputKey, role }` through the generated SDK client and keep
  cancellation and stale-input tests.
- Audit any future Web generation Plugin as a separate affected identity before
  moving it to the corrected contract.

## Human decision audit record

- Decision: pending
- Reviewer identity: pending
- Decision time: pending
- Protected receipt URL and SHA-256: pending
- Accepted published contract version and digest: pending
- Runtime conformance evidence: pending

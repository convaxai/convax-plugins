# Host capability request: Web Plugin image input read

Status: pending human review

## User problem

- Affected Plugins and source versions: `multi-angle@0.1.3`,
  `relight-studio@0.1.4`, and `panorama-viewer@0.2.4`.
- Catalog: `@convax/plugin-api` major 1, generated release 1.0.0.
- Accepted APIs awaiting protected publication evidence:
  `canvas.inputs.image.open` and `canvas.inputs.image.close`, bound to their exact
  Catalog contract digests.
- Blocked workflow: each Plugin can list image metadata through
  `canvas.inputs.list`, but cannot decode the selected image for its preview or
  interactive renderer using only Catalog APIs. The legacy
  `canvas.connectedImage.read` method is not admitted by the
  `@convax/plugin-sdk/client` `convax.plugin-host/8` ABI.

## Blocked Plugin use case

- Users connect one Project-backed Canvas image directly to a Plugin node and
  expect an in-frame preview before generation, relighting, or panorama
  interaction.
- Input is one opaque key returned by `canvas.inputs.list`; open returns one
  opaque bearer session URL plus bounded image probe metadata, and close explicitly
  revokes that session.
- Resource resolution, direct-edge revalidation, byte limits, MIME validation, and
  stale-frame checks are generic Host responsibilities. Plugin code cannot safely
  reproduce them.
- Cancellation, changed edges, changed resource identity, explicit close, or frame
  disposal must terminate the session and make its bearer URL unusable without
  persisting Plugin state.

## Catalog evidence

- Checked Catalog version: `@convax/plugin-api@2.0.0`, canonical JSON SHA-256
  `a23b847c3513e810777a0444ee3c3cd20414b4ee57e2b93a0a663fba2545e99d`.
- Closest existing APIs: `canvas.inputs.list`, `canvas.inputs.open`, and
  `canvas.inputs.close`.
- Availability result: those APIs are declared for Web Plugins, but the catalog
  does not define an image-decoding response consumable by an iframe renderer.
- Why required/optional declaration does not solve it: declaration controls
  negotiation only; it cannot add semantics absent from the published contract.

## Requested generic contract

- Proposed capability id or contribution:
  `canvas.inputs.image.close`
  (`sha256:419a4c7ebf078c5ec95bc193cbd07d66b96c3c4ebfe3a31f188ebec1995bbc2e`)
  and `canvas.inputs.image.open`
  (`sha256:3c5ee38bad065463f9abd292ef399a12777aa1530837dab2fdc1f017c7784e9d`).
- Intended audiences: `web-plugin`.
- Scope: `own-node`.
- Side effect: `read` for open; `write` for session revocation through close,
  without Canvas or Project mutation.
- Required grant: `canvas.connectedImages.read`.
- Bounded request: open accepts
  `{ "inputKey": "<opaque key from canvas.inputs.list>" }`; close accepts only
  `{ "sessionId": "<opaque session returned by open>" }`.
- Bounded response: open returns `{ sessionId, url, probe }`, where `url` is a
  high-entropy `convax-connected-media://` bearer URL and `probe` contains bounded
  validated image MIME, size, dimensions, and content revision; close returns
  `{ closed }`. Neither response exposes a native path, unrestricted URL, raw
  bytes, or inline image content.
- Stable errors: open admits `permission-denied`, `resource-unavailable`, and
  `stale-context`; close admits `permission-denied` and `stale-context`.
- Cancellation and stale-scope behavior: caller cancellation, frame disposal,
  changed direct edge, changed resource identity, or changed Plugin scope aborts
  open and revokes any partial session. Close is idempotent only as defined by the
  published contract; every successful or abandoned open session must be closed.
  Availability begins only with the exact receipt-bound Catalog contracts.

## Alternatives considered

- `canvas.inputs.open`: remains the generic admitted audio/video stream contract;
  reinterpreting it as an image bearer session would invent behavior outside its
  Catalog contract.
- `canvas.inputs.list`: intentionally returns pathless metadata, not resource bytes.
- `generation.execute`: can bind references for generation but cannot render an
  interactive source preview.
- Plugin-local filesystem or network access: forbidden by iframe isolation and
  would bypass Project resource authority.
- Removing previews: regresses the core multi-angle, relight, and panorama
  workflows and provides no truthful way to inspect the selected input.

## Security and authority

- Bind issuance and close/revoke to the exact installed Plugin, frame, Project,
  Canvas, owning node, direct incoming edge, and current resource identity.
- Require `canvas.connectedImages.read`; declaration alone grants no authority.
- Accept only a current opaque `inputKey`; reject caller-supplied paths, URLs, and
  unrelated node ids.
- Treat possession of the opaque `convax-connected-media://` URL as bearer
  authority for GET/HEAD. The protocol request has no trustworthy sender or frame
  principal. On every serve, the Host must instead revalidate the live session's
  recorded Plugin principal, frame lifecycle, direct edge, resource identity, and
  revision.
- Keep bearer URLs secret, high entropy, and short-lived. Do not log, persist, or
  expose them through another Host surface, and close promptly after image load or
  on every abandonment path.
- Preserve MIME, byte, and pixel limits. Recheck the edge and resource after
  asynchronous I/O.
- Abort on frame disposal or cancellation and revoke through close. Sessions have
  no durable side effect and must not authorize upload, generation, or state
  mutation.

## Compatibility

- Older Hosts report the API unavailable through `host.context.get`; affected
  Plugins remain publication-blocked and must not fall back to the legacy method.
- Once the protected receipt is accepted, the Plugins declare both open and close
  as required because a bearer session without its revocation operation is not an
  admissible partial capability.
- The transport remains `convax.plugin-host/8`; availability is versioned by
  Catalog `since`.
- Rollback removes the new Plugin releases rather than rewriting installed package
  bytes or re-enabling a legacy protocol.

## Falsifiable acceptance tests

1. Catalog generation emits both accepted API ids with the exact contract digests,
  `web-plugin` audience, `canvas.connectedImages.read` grant, `own-node` scope,
  declared side effects, errors, documentation, and `since`.
2. An authorized directly connected JPEG/PNG/WebP opens one bounded bearer session
  with safe probe metadata; close revokes it and subsequent URL access fails.
3. Missing grant, wrong Plugin, wrong Project/Canvas/node, unrelated key, stale edge,
  changed resource, invalid MIME, oversized bytes, excessive pixels, and malformed
  data fail closed.
4. Cancellation and frame disposal terminate reads, revoke partial sessions, and
  leave no persistent state.
5. Concurrent sessions remain bounded; random, malformed, expired, closed, or
  stale-session bearer URLs fail. Tests must not assume request-origin binding:
  possession can serve only while the session's recorded principal, frame, edge,
  resource revision, and lifetime remain valid.
6. Multi-angle, relight, and panorama packed v8 assets load and render the selected
  image without any legacy protocol or method string.
7. Existing `canvas.inputs.open` audio/video consumers and security policy remain
  unchanged.

## Plugin-side plan after approval

- Declare both exact released API ids and the exact grant in the three manifests.
- Replace the temporary blocked image adapters with the published open/use/finally
  close session lifecycle and retain cancellation, revocation, and stale-input
  tests.
- Regenerate SDK-owned references during packing; do not edit Host code or
  generated Catalog bytes from this task.

## Human decision audit record

- Decision: pending
- Reviewer identity: pending
- Decision time: pending
- Protected receipt URL and SHA-256: pending
- Accepted published contract version and digest: pending
- Runtime conformance evidence: pending

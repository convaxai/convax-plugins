# Host capability request: Web Plugin image input read

Status: pending human review

## User problem

- Affected Plugins and source versions: `multi-angle@0.1.3`,
  `relight-studio@0.1.4`, and `panorama-viewer@0.2.4`.
- Catalog: `@convax/plugin-api` major 1, generated release 1.0.0.
- Missing API: an unambiguous v8 Web Plugin contract that reads one direct incoming
  image by opaque `inputKey`.
- Blocked workflow: each Plugin can list image metadata through
  `canvas.inputs.list`, but cannot decode the selected image for its preview or
  interactive renderer using only Catalog APIs. The legacy
  `canvas.connectedImage.read` method is not admitted by the
  `@convax/plugin-sdk/client` `convax.plugin-host/8` ABI.

## Blocked Plugin use case

- Users connect one Project-backed Canvas image directly to a Plugin node and
  expect an in-frame preview before generation, relighting, or panorama
  interaction.
- Input is one opaque key returned by `canvas.inputs.list`; output is bounded image
  content plus safe metadata.
- Resource resolution, direct-edge revalidation, byte limits, MIME validation, and
  stale-frame checks are generic Host responsibilities. Plugin code cannot safely
  reproduce them.
- Cancellation, changed edges, changed resource identity, or frame disposal must
  terminate the read and return a safe error without persisting state.

## Catalog evidence

- Checked Catalog version: `@convax/plugin-api@1.0.0`, canonical JSON SHA-256
  `5647290670309c550c144b2746a17bc0fa0dd504484fb137952620896dc889e4`.
- Closest existing APIs: `canvas.inputs.list`, `canvas.inputs.open`, and
  `canvas.inputs.close`.
- Availability result: those APIs are declared for Web Plugins, but the catalog
  does not define an image-decoding response consumable by an iframe renderer.
- Why required/optional declaration does not solve it: declaration controls
  negotiation only; it cannot add semantics absent from the published contract.

## Requested generic contract

- Proposed capability id or contribution: `canvas.inputs.image.read`.
- Intended audiences: `web-plugin`.
- Scope: `own-node`.
- Side effect: `read`.
- Required grant: `canvas.connectedImages.read`.
- Bounded request: `{ "inputKey": "<opaque key from canvas.inputs.list>" }`.
- Bounded response: a bounded validated image `dataUrl`, MIME type, name, size, dimensions,
  and media revision; no native path or unrestricted URL.
- Stable errors: `permission-denied`, `stale-context`, and `resource-unavailable`.
- Cancellation and stale-scope behavior: caller cancellation, frame disposal,
  changed direct edge, changed resource identity, or changed Plugin scope aborts
  the read and returns no content. Availability begins only with the next approved
  minor release of Host API major 1.

## Alternatives considered

- `canvas.inputs.open`: the generated Catalog does not define admitted media kinds,
  an image decoding contract, or how its stream descriptor may be consumed by an
  image renderer. Treating that ambiguity as image support would invent behavior
  outside the Catalog.
- `canvas.inputs.list`: intentionally returns pathless metadata, not resource bytes.
- `generation.execute`: can bind references for generation but cannot render an
  interactive source preview.
- Plugin-local filesystem or network access: forbidden by iframe isolation and
  would bypass Project resource authority.
- Removing previews: regresses the core multi-angle, relight, and panorama
  workflows and provides no truthful way to inspect the selected input.

## Security and authority

- Bind the request to the exact installed Plugin, frame, Project, Canvas, owning
  node, direct incoming edge, and current resource identity.
- Require `canvas.connectedImages.read`; declaration alone grants no authority.
- Accept only a current opaque `inputKey`; reject caller-supplied paths, URLs, and
  unrelated node ids.
- Preserve existing MIME, byte, pixel, and data-URL limits. Recheck the edge and
  resource after asynchronous I/O.
- Abort on frame disposal or cancellation. Reads have no durable side effect and
  must not authorize upload, generation, or state mutation.

## Compatibility

- Older Hosts report the API unavailable through `host.context.get`; affected
  Plugins remain publication-blocked and must not fall back to the legacy method.
- Once approved, the Plugins declare the API as required because their primary Web
  workflows cannot operate truthfully without image content.
- The transport remains `convax.plugin-host/8`; availability is versioned by
  Catalog `since`.
- Rollback removes the new Plugin releases rather than rewriting installed package
  bytes or re-enabling a legacy protocol.

## Falsifiable acceptance tests

1. Catalog generation validates id, `web-plugin` audience, grant, scope, read side
  effect, errors, documentation, and `since`.
2. An authorized directly connected JPEG/PNG/WebP succeeds and returns bounded safe
  metadata and content.
3. Missing grant, wrong Plugin, wrong Project/Canvas/node, unrelated key, stale edge,
  changed resource, invalid MIME, oversized bytes, excessive pixels, and malformed
  data fail closed.
4. Cancellation and frame disposal terminate reads without persistence.
5. Concurrent requests remain bounded and cannot leak data across frames.
6. Multi-angle, relight, and panorama packed v8 assets load and render the selected
  image without any legacy protocol or method string.
7. Existing `canvas.inputs.open` consumers and security policy remain unchanged.

## Plugin-side plan after approval

- Declare only the exact released API id and grant in the three manifests.
- Replace the temporary blocked image-stream adapters with the published response
  contract and retain all cancellation/stale-input tests.
- Regenerate SDK-owned references during packing; do not edit Host code or
  generated Catalog bytes from this task.

## Human decision audit record

- Decision: pending
- Reviewer identity: pending
- Decision time: pending
- Protected receipt URL and SHA-256: pending
- Accepted published contract version and digest: pending
- Runtime conformance evidence: pending

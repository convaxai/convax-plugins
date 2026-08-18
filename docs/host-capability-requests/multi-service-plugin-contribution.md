# Host capability request: multiple service contributions per Plugin

Status: pending human review

## User problem

A single installed Plugin may represent several independently authorizable services
that intentionally share one reviewed companion executable. Users need each service
to appear separately in Services, expose only its own account/status/actions and
models, and route Canvas generation to the matching service without installing the
same companion artifact more than once.

The current public contract can represent one service identity per Plugin only.
Collapsing several accounts into one service card makes authorization and model
availability ambiguous; splitting them into separate Plugins preserves correctness
but cannot express that they are service-scoped profiles of one logical Plugin.

## Blocked Plugin use case

The blocked use case is one headless Tool Plugin with:

- two or more independent service identities, each with its own authorization
  lifecycle and `convax.plugin-service-status/2` projection;
- service-scoped generation tools and model catalogs, where ordinary local tool ids
  such as `image.generate` may be reused safely by different services;
- one immutable `mcp-stdio` companion artifact, launched or addressed through a
  different static runtime profile for each declared service.

`convax.plugin/8` has one `contributes.service`, one top-level `runtime`, and one
Plugin-wide `contributes.generation` namespace. It therefore has no place to bind a
service identity to its runtime profile, generation tools, models, or fixed
`service.*` MCP routes. Flattening several services into the current fields causes
one or more of the following losses:

- one aggregate service status instead of independent accounts;
- one static runtime argument set instead of a service-scoped profile;
- generation tool id collision, or author-invented namespacing with no Host-known
  service association;
- ambiguous `service.status`, `service.authorize`,
  `service.authorization.complete`, `service.authorization.cancel`,
  `service.sign_out`, and `service.checkout` routing.

## Catalog evidence

- Checked Catalog version: `@convax/plugin-api` `3.0.0`, generated Catalog version
  `3.0.0`; also checked the public `@convax/plugin-sdk` `0.2.0` declarations for
  `convax.plugin/8`.
- Closest existing APIs: `generation.execute` contract `3.0.0` and
  `generation.tools.list` contract `2.0.0`, both scoped to one installed Plugin.
  The closest manifest fields are singular `contributes.service?:
  PortablePluginServiceContribution` and singular `runtime?:
  PortablePluginMcpStdioRuntime`.
- Availability result: no Catalog API or SDK contribution accepts a `serviceId`,
  declares several services, associates generation/model entries with a service,
  or selects a service-scoped runtime profile. The published v8 parser rejects a
  plural `contributes.services` field with `Plugin contributions contains an
  unsupported field: services`, rejects a runtime array with `Plugin runtime must
  be an object`, and rejects flattened repeated generation tool ids with
  `Generation tools contain duplicate ids`.
- Why required/optional declaration does not solve it: `hostApi.required` and
  `hostApi.optional` negotiate published callable APIs only. They cannot change the
  closed manifest grammar, increase contribution cardinality, create service
  identities, or alter runtime and MCP tool routing.

## Requested generic contract

- Proposed capability id or contribution: a new reviewed manifest schema release
  after `convax.plugin/8` that supports a bounded plural service contribution. The
  exact schema version and field spelling are Host/SDK owner decisions; this
  request does **not** assume it must be named `convax.plugin/9`. Each entry must
  have a stable `serviceId`, service actions, an optional service-scoped generation
  and model catalog, and a reference to one declared runtime profile.
- Intended audiences: Plugin authors and Marketplace tooling at authoring time;
  Desktop Main and the verified companion boundary at runtime. This is declarative
  Plugin ABI, not a Web Plugin method and not an Agent Skill authority.
- Scope: one exact installed Plugin snapshot and one declared `serviceId` within
  that snapshot. Effective service, generation-tool, and model identities are
  scoped by the pair `{ plugin snapshot, serviceId }`; they are never global ids.
- Side effect: parsing, listing, and resolving contributions are read-only.
  `service.*` and generation calls retain their existing individual side-effect
  and long-running-operation semantics after routing to the selected service.
- Required grant: no new ambient grant. Existing install consent and generation
  authority remain Plugin-owned; `serviceId` narrows routing and must not expand
  filesystem, credential, network, Canvas, or Agent authority.
- Bounded request: a manifest contains a small bounded array of uniquely identified
  services. A `serviceId` is a non-empty, length-bounded portable identifier. Each
  service references a statically declared runtime profile and owns bounded
  service actions, generation tools, and model-to-tool references. Runtime profile
  arguments remain static manifest tokens: no credentials, native paths, code, or
  caller-controlled arguments.
- Bounded response: Host discovery returns one bounded service projection per
  declared `serviceId`, with only that service's actions, status availability,
  tools, models, runtime availability, and stable display metadata. Secret account
  material and runtime arguments are never returned.
- Stable errors: the published contract must define a closed set covering at least
  duplicate/invalid service identity, missing or ambiguous runtime profile,
  duplicate tool identity within one service, cross-service model reference,
  unsupported service action, unavailable runtime profile, missing service, and a
  stale service/snapshot binding. Parse-time failures and runtime availability
  failures must remain distinguishable.
- Cancellation and stale-scope behavior: every call is bound to the exact Plugin
  snapshot, `serviceId`, runtime profile generation, and selected tool/model.
  Updating, disabling, or removing that service cancels cancelable reads/actions
  and rejects late results as stale without affecting sibling services. An
  accepted durable generation job keeps the existing LRO recovery contract and is
  polled/cancelled only through its original service profile.

The required routing semantics are:

1. Within one service, generation tool ids are unique; the same local tool id may
   appear in another service because the Host resolves `{ serviceId, toolId }`.
2. A model's `tool` reference resolves only inside the model's own service. It
   cannot fall through to another service or to a Plugin-wide first match.
3. Runtime `tools/list` and generation execution are evaluated against the selected
   service's static runtime profile. Missing or malformed profile-specific model
   data fails closed for that service only.
4. Fixed MCP routes such as `service.status` and `service.authorize` keep their
   protocol names, but the Host directs them to the runtime instance/context
   already bound to the selected `serviceId`; a caller does not inject an arbitrary
   service selector into a `service.*` request.
5. All runtime profiles reference one top-level companion command/artifact closure.
   Registry and installation deduplicate the exact `{ command, version, target,
   size, SHA-256 }` artifact, verify and store its bytes once, and may create
   isolated service-scoped runtime contexts without duplicating release assets.
   Artifact deduplication never merges credentials, process state, cancellation,
   or service status.

## Alternatives considered

- **Separate Plugin per service plus one shared companion command:** valid under
  v8 and the safe fallback while this request is pending. It preserves service
  isolation, but does not let one Plugin own several service identities and repeats
  Plugin lifecycle/catalog entries.
- **One aggregate service in one Plugin:** fits v8, but one status/action surface
  cannot truthfully represent several independent accounts, authorization flows,
  plans, or model availability states.
- **Prefix every MCP/generation tool name:** avoids a subset of tool-name
  collisions, but does not add multiple Host service records, service-scoped model
  ownership, runtime profiles, or unambiguous fixed `service.*` routing.
- **Put a `serviceId` in arbitrary tool arguments:** the current manifest does not
  authorize it, it lets a caller select authority dynamically, and it cannot
  repair the singleton Services projection.
- **Inter-Plugin exports/imports:** these route declared Plugin-to-Plugin
  operations; they neither register Host Services nor change manifest/runtime
  cardinality.
- **Multiple runtime objects in v8:** the published parser explicitly rejects this
  shape. Reinterpreting v8 would break its closed schema and existing validation.

## Security and authority

The installed Plugin snapshot remains the principal. `serviceId` is a bounded
subresource and routing key, not a new global principal, grant, service locator, or
permission to choose an executable. Host behavior must be completely generic and
must never branch on a concrete Plugin, vendor, provider, model, command, or
service id.

The Host selects service and runtime profile only from the validated immutable
manifest and exact ActiveSet snapshot. Renderer, Canvas state, prompts, model ids,
MCP arguments, and remote responses cannot supply or override the command, profile,
or service binding. Each profile receives only the credentials and private state
for its service; status, sign-out, cancellation, checkout, and generation for one
service cannot read, mutate, or revoke a sibling service.

Runtime profiles may share verified executable bytes, but not mutable authority.
They must retain separate lifecycle/cancellation generations and private storage
namespaces. Static profile arguments contain no credentials or paths. Artifact
deduplication is allowed only for identical verified bytes and cannot be inferred
from a matching filename or command alone.

No iframe callback, raw IPC, direct MessageChannel, global registry, service
locator, Plugin-to-Plugin call, or Host-private API is introduced by this request.

## Compatibility

The plural contribution requires a new manifest schema release because v8 is a
closed schema and its singleton meanings are already published. Human reviewers
and SDK owners must choose the actual schema/version; v8 bytes must never acquire
new behavior based on field presence or runtime discovery.

Existing `convax.plugin/8` packages continue to mean exactly one optional service,
one optional executable runtime, and one Plugin-wide generation contribution.
Hosts that do not support the future schema reject it as unsupported before
starting a companion; they must not load the first service, flatten services, or
silently fall back to v8. A future one-service declaration may be semantically
equivalent to v8, but installed package bytes are not rewritten or migrated in
place.

The primary release impact is a breaking `@convax/plugin-sdk` manifest ABI and
corresponding Marketplace/Registry validation and generated authoring references.
If implementation requires no new callable Host API, `@convax/plugin-api` Catalog
3.0.0 need not be changed merely to describe a manifest contribution. If a new
callable API is ultimately selected, it must receive its own Catalog `since`,
SemVer, closed contract, digest, availability rules, and generated documentation
before Plugins may declare it.

Registry companion metadata must continue to bind one command to one exact
target-specific artifact closure. Multiple service profiles may reference that
closure, but release selection, download, verification, update, rollback, and
uninstall deduplicate by immutable artifact identity and remain atomic for the
owning Plugin snapshot.

## Falsifiable acceptance tests

1. A future-schema generic fixture with two service entries, distinct
   `serviceId`s, the same local generation tool id in both entries, and one shared
   companion artifact validates. Host discovery returns exactly two isolated
   Services; each model resolves to the tool and runtime profile in its own
   service.
2. Calling `service.status`, authorization completion, sign-out, model discovery,
   generation, polling, and cancellation for one service reaches only that
   service's profile. Test credentials and state planted in the sibling profile
   are neither observed nor changed.
3. Duplicate `serviceId`, duplicate tool id inside one service, missing profile,
   cross-service model reference, undeclared action, caller-selected profile, and
   malformed profile model catalog each fail with the documented stable error and
   start no executable or generation side effect.
4. Updating or uninstalling the Plugin during status/model discovery cancels the
   old profile call and rejects its late response as stale. An already accepted
   durable LRO remains recoverable under its original service binding; its result
   cannot be committed to a sibling service.
5. Packing and installing the two-service fixture emits, downloads, hashes, and
   stores exactly one companion artifact for each target. Corrupt bytes fail the
   whole Plugin install; identical filenames with different hashes do not dedupe.
6. A current v8 singleton-service fixture has byte-for-byte unchanged validation
   and runtime behavior. A Host that supports only v8 rejects the future schema
   before runtime startup and never partially exposes one of its services.
7. A static check proves the generic Host/SDK implementation contains no concrete
   Plugin, vendor, provider, model, command, or service id branch and creates no
   new credential, filesystem, renderer, IPC, or Agent authority.
8. This request must be rejected or mapped to an existing contract if a released
   public SDK and conformance fixture can already register two independent Host
   Services from one Plugin, reuse one verified artifact, repeat a local tool id,
   isolate credentials/actions, and route models without private conventions.

## Plugin-side plan after approval

Wait for the reviewed manifest/SDK release, generated authoring references, exact
schema digest, Registry conformance, runtime profile contract, and protected human
decision receipt. Then, entirely in `convax-plugins`:

1. declare a bounded set of generic service entries and their service-scoped
   generation/model contributions;
2. point all entries at static profiles of one reviewed companion artifact;
3. keep credentials, status, cancellation, models, jobs, and tests isolated by
   `serviceId`;
4. add clean-profile validation, pack, artifact-deduplication, stale/cancellation,
   update, rollback, and uninstall evidence;
5. replace the pending technical blocker only after automated checks can verify the
   published contract and runtime conformance.

Until then, use separate v8 Plugins or remain blocked. Do not invent an unofficial
plural field, raw IPC/MCP bridge, dynamic service selector, or Host patch from the
Plugin task.

## Human decision audit record

- Decision: pending
- Reviewer identity: pending
- Decision time: pending
- Protected receipt URL and SHA-256: pending
- Accepted published contract version and digest: pending
- Runtime conformance evidence: pending

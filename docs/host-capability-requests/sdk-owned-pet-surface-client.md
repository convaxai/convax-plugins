# Host capability request: SDK-owned Pet surface client

Status: pending human review

## User problem

Convax Pet users need the overlay and settings surfaces to read activity, open
activity destinations, update preferences, and manage custom pets without each
Plugin implementing a second MessagePort protocol client. `convax-pet@0.2.3`
currently preserves those features through a handwritten `convax.pet-host/1`
request, response, event, timeout, and pending-request state machine. That code
cannot be treated as SDK-owned and therefore blocks publication.

## Blocked Plugin use case

The Plugin contributes both `pet/overlay` and `pet/settings` surfaces through the
portable `contributes.pet` contract. Each sandboxed surface must connect only to
its exact parent, installed Plugin identity, and declared surface, then invoke the
existing Pet operations and subscribe to bounded Pet events. The published
`@convax/plugin-sdk/client` owns the `convax.plugin-host/8` client for a normal
Web `entry`, but exposes no corresponding client for a Pet contribution. Reusing
the Web entry client would claim `hostApi` semantics that the Pet surface does not
have.

## Catalog evidence

- Checked Catalog version: `@convax/plugin-api@3.0.0`, canonical JSON SHA-256 `e49ca2713fb66fef5d52b8d85735c68341a1f1d0390379f8ccef2d3d3434a45f`.
- Closest existing APIs: `@convax/plugin-sdk/client` exports the normal Web Plugin client; the Host API Catalog contains no Pet-surface transport factory because Pet operations are contribution-scoped rather than ordinary `hostApi` calls.
- Availability result: the installed public SDK has no SDK-owned Pet overlay/settings client, connection parser, typed request/result parser, cancellation contract, or late-response policy.
- Why required/optional declaration does not solve it: `hostApi` negotiation cannot change a `contributes.pet` surface into a normal Web `entry` or manufacture a missing SDK transport owner.

## Requested generic contract

- Proposed capability id or contribution: a public SDK-owned Pet surface client contract, for example an `@convax/plugin-sdk/pet-client` export consumed by every `contributes.pet` overlay or settings surface.
- Intended audiences: sandboxed Pet overlay and Pet settings author source for any admitted Plugin; no concrete Plugin id or vendor branch.
- Scope: one exact installed Plugin snapshot, transferred port, declared `overlay` or `settings` surface, and current Pet owner context.
- Side effect: typed read, navigation, preference mutation, and custom-pet mutation operations only as already granted by the manifest's Pet capabilities.
- Required grant: derive authority from the validated Pet capability declaration and installed snapshot; importing the client grants nothing.
- Bounded request: SDK-defined operation ids and bounded validated parameter schemas, with a maximum in-flight count and AbortSignal cancellation.
- Bounded response: SDK-validated operation results and events with per-message byte limits; no native paths, credentials, raw IPC, or unrestricted URLs.
- Stable errors: closed, aborted, invalid-envelope, invalid-params, invalid-result, permission-denied, stale-context, transport-failed, and unknown-or-late-response.
- Cancellation and stale-scope behavior: abort sends a bounded cancellation when supported; close rejects all pending calls; an unknown, duplicate, late, wrong-surface, or wrong-principal message fails closed.

## Alternatives considered

- Keep the handwritten `pet-host.js` client: preserves product behavior but leaves
  protocol parsing, bounds, cancellation, and unknown-response policy outside the
  SDK owner; it is acceptable only while publication remains blocked.
- Reuse `createPluginHostClient`: that factory requires a normal Web `entry` and
  `host.context.get`, while Pet surfaces have an explicit separate contribution
  contract and capabilities.
- Import Host-private IPC or copy its implementation: forbidden by the repository
  boundary and would create a second unaudited owner.
- Remove Pet activity, navigation, settings, or custom-pet behavior: avoids the
  transport but deletes the Plugin's product function instead of fixing the
  generic authoring gap.

## Security and authority

The SDK client must validate the parent source, one transferred port, exact
installed Plugin identity, and declared Pet surface before accepting authority.
It must derive allowed operations from validated manifest capabilities, enforce
bounded messages and pending calls, parse every parameter/result/event, propagate
cancellation, reject unknown or late responses, and close on protocol failure.
Renderer code must not receive Electron IPC, filesystem paths, credentials, or a
generic method bridge.

## Compatibility

This request does not change `convax.plugin/8`, the Host API Catalog major, or the
current `convax.pet-host/1` wire contract by itself. A reviewed Host-owned task may
publish a generic SDK client around the admitted Pet ABI or propose an explicitly
versioned replacement. Older SDKs remain unsupported for the new Plugin release;
`convax-pet@0.2.3` remains publication-blocked until an exact published SDK
version, digest, and runtime conformance receipt are verified.

## Falsifiable acceptance tests

1. A clean external Plugin project imports only the published Pet client, bundles it into both surfaces, and contains no authored request envelope, response parser, pending map, or direct MessagePort call.
2. Wrong parent, Plugin id, surface, port count, capability, parameter/result/event shape, oversized message, cancellation, close, stale context, duplicate response, and late response all fail closed in SDK conformance tests.
3. If the generic client cannot preserve every current Pet operation without a concrete Plugin-id branch, raw IPC, or broader authority, the proposal is rejected and the Plugin remains blocked.
4. Convax Pet package tests prove activity, navigation, preferences, custom-pet management, and event subscriptions remain functional after replacing the handwritten client.
5. Publication tooling proves deleting the workspace declaration, policy binding, or pending request document cannot make the raw transport publishable.

## Plugin-side plan after approval

After a separate human-approved Host task publishes the generic SDK client,
replace `package/assets/pet-host.js` with author source that imports that exact
public export, bundle it into the immutable package, add cancellation and
unknown/late-response conformance tests, update the dependency version, and bind
the published SDK digest/runtime evidence before removing this blocker. This
Plugin task must not inspect or modify Host source.

## Human decision audit record

- Decision: pending
- Reviewer identity: pending
- Decision time: pending
- Protected receipt URL and SHA-256: pending
- Accepted published contract version and digest: pending
- Runtime conformance evidence: pending

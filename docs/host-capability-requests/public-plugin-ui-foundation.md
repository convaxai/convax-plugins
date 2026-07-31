# Host capability request: Public Plugin UI foundation

Status: pending human review

## User problem

Sandboxed Web Plugin users need controls, surfaces, states, and accessibility
behavior that feel consistent with Convax. Today each Plugin must independently
guess color, typography, spacing, radius, shadow, focus, disabled, scrolling, and
motion rules, so visual consistency drifts even when the product composition is
otherwise correct.

## Blocked Plugin use case

`convax-pet@0.3.1` contributes an overlay and a settings surface. Pet-specific
artwork, layout, copy, collection behavior, and activity presentation remain
Plugin-owned, but the standard buttons, icon buttons, cards, badges, fields,
notices, empty states, focus treatment, and light/dark foundations need the same
published authoring contract available to any sandboxed Web Plugin. The current
package instead hard-codes a separate visual foundation; copying private styles
would create an unversioned second owner and cannot support a publishable claim of
design alignment.

## Catalog evidence

- Checked Catalog version: `@convax/plugin-api@2.0.0`, canonical JSON SHA-256 `a23b847c3513e810777a0444ee3c3cd20414b4ee57e2b93a0a663fba2545e99d`.
- Closest existing APIs: the public Plugin SDK includes portable declarations for Host-rendered command icons and placements, but it publishes no browser CSS tokens, accessible control recipes, or standalone author fixture.
- Availability result: the published baseline has no such package. The reviewed local `@convax/plugin-ui@0.1.0` candidate now exposes a standalone, no-dependency system light/dark semantic foundation.
- Why required/optional declaration does not solve it: `hostApi` negotiation grants runtime operations; it cannot provide versioned build-time CSS assets or make private application components safe for Plugin use.

## Requested generic contract

- Proposed capability id or contribution: a versioned browser package contract, provisionally `@convax/plugin-ui`, containing public semantic CSS tokens, accessible CSS recipes, documentation, and a standalone fixture for sandboxed Web Plugin author source.
- Intended audiences: all sandboxed Web Plugin surfaces that render Plugin-owned DOM; no concrete package id, vendor, feature name, or privileged built-in audience.
- Scope: build-time light and dark semantic tokens for canvas, surface, elevation, border, text, accent, status, disabled, focus, typography, spacing, radius, shadow, control height, scrolling, and motion, plus recipes for button, icon button, card, badge, field, notice, and empty state.
- Side effect: none at runtime; importing and bundling the package only contributes inert CSS or browser ESM bytes to the Plugin's immutable snapshot.
- Required grant: none; package installation or import grants no IPC, network, filesystem, credential, navigation, activity, storage, or native-window authority.
- Bounded request: author source may import only documented package exports at one exact SemVer; builds resolve those finite local assets without runtime fetches, Host DOM access, or mutable global injection.
- Bounded response: deterministic browser-safe CSS or ESM plus documentation and fixture bytes, with declared package integrity and no native code, dependency tree, remote script, application source path, or private component implementation.
- Stable errors: dependency-unavailable, unsupported-version, invalid-token-contract, invalid-recipe-contract, and integrity-mismatch during clean install or build; there is no runtime method error channel.
- Cancellation and stale-scope behavior: no runtime request, principal, or cancellable session exists; installed Plugin snapshots retain bundled exact bytes, and a newer design package affects them only after an explicit Plugin version build, review, and update.

## Alternatives considered

- Keep bespoke Pet CSS: preserves the current screen but continues visual drift and
  cannot prove alignment with a shared public contract.
- Copy application styles or private components: rejected because private paths,
  release cadence, dependencies, and DOM assumptions are not a stable Plugin ABI.
- Inject application-global CSS at runtime: rejected because it mutates previously
  reviewed Plugin presentation and breaks immutable snapshot ownership.
- Add a runtime theme API now: unnecessary for the first contract. The initial
  package can document operating-system light/dark behavior; synchronizing a
  separate application-only theme requires independent evidence and review.
- Publish Pet-specific components: rejected because `PetCard`, sprite stage,
  collection layout, and activity tray composition belong to the Plugin product,
  not a generic design foundation.

## Security and authority

The package principal is ordinary author build input and receives no runtime
authority. Its reviewed output must be browser-safe inert CSS or ESM, contain no
credentials, native bindings, remote imports, install hooks, telemetry, DOM escape,
or generic action bridge, and be bundled through the repository's standard static
Web build. Semantic names must not expose private application structure. Focus,
disabled, contrast, and reduced-motion rules must work without reading a parent
document or relying on a concrete Plugin identity.

## Compatibility

The first accepted package should use independent SemVer and documented export
stability; adding it does not by itself change `convax.plugin/8`, the Host API
Catalog major, or a runtime transport. Older author environments without the exact
package fail the clean build rather than substitute copied styles. Installed
Plugin snapshots remain self-contained. System light/dark is the only appearance
input in this request; a future application-specific appearance context would be a
separate generic contract.

## Falsifiable acceptance tests

1. Two clean external Plugin fixtures with unrelated ids import only the published package, bundle through the supported Web build, and render the same documented token and recipe behavior without private paths or concrete-id branches.
2. Light, dark, focus-visible, keyboard, disabled, error, high-contrast, and reduced-motion fixtures match the approved public reference and satisfy the documented accessibility assertions.
3. Static inspection proves the package and fixtures contain no private application import, runtime fetch, remote script, native binding, credential, parent-DOM read, mutable global injection, or generic privileged bridge.
4. Missing dependency, unsupported version, malformed export, and integrity mismatch fail the clean install or build with the documented stable error and never fall back to copied local styles.
5. Rebuilding against the same exact package version produces byte-identical bundled foundation assets, while a package upgrade requires an explicit Plugin version update and review.
6. If exact visual alignment requires private implementation, runtime identity checks, or broader runtime authority, this proposal is rejected and affected Plugins remain publication-blocked.

## Plugin-side plan after approval

The separate user-approved Host task added `@convax/plugin-ui@0.1.0` as an
independently publishable, no-dependency CSS package. Convax Pet's deterministic
build copies its exact standalone theme into the immutable snapshot, both surfaces
load it before Pet composition, and Pet CSS now uses public semantic variables
instead of a second hard-coded foundation. Pet-owned sprites, layout, copy, and
activity/collection composition remain local. The blocker stays pending until the
protected receipt, published package integrity, and clean-build evidence are
verifiable. This work must not copy or depend on private application implementation.

## Human decision audit record

- Decision: pending
- Reviewer identity: pending
- Decision time: pending
- Protected receipt URL and SHA-256: pending
- Accepted published contract version and digest: pending
- Runtime conformance evidence: pending

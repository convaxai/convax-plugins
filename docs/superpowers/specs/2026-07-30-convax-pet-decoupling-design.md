# Convax Pet Decoupling and Design-System Alignment

**Date:** 2026-07-30

**Status:** Proposed design for human review; no Host implementation authority

**Plugin owner:** `packages/plugins/convax-pet`

**Host boundary:** public `convax.plugin/8`, Host API Catalog, and published Plugin SDK packages only

## 1. Goal

Rework Convax Pet so that the Host never identifies or treats the concrete
`convax-pet` package specially. Pet product behavior and presentation remain
Plugin-owned, while the Host exposes only public, versioned contribution and
security contracts that any conforming Pet provider may use.

At the same time, make the Pet surfaces use the same published design foundation
as Convax instead of maintaining a visual imitation through copied color, spacing,
typography, radius, focus, and control styles.

This design does not inspect or modify private Host implementation. Missing public
support is recorded in this repository and remains blocked until explicit human
approval, published SDK/catalog artifacts, and runtime conformance evidence exist.

## 2. Current evidence

The current `convax-pet@0.2.3` manifest is a valid `convax.plugin/8` Pet provider
with `contributes.pet`, four Pet grants, and no ordinary Web `hostApi` calls.
However:

- both Pet surfaces import a handwritten `assets/pet-host.js` transport;
- the settings surface passes the concrete `pluginId: "convax-pet"` into that
  transport;
- the package owns a second request/response/event/pending-call state machine;
- the published `@convax/plugin-sdk@0.1.0` exports only the ordinary Web Plugin
  client and no Pet-surface client;
- the generated Host API Catalog `1.0.0` has no activity, overlay, preferences,
  custom-asset, appearance, theme, or design-token API;
- the public SDK UI contract contains Host-rendered command/icon declarations but
  no reusable Plugin design tokens, CSS foundation, or browser components;
- Pet CSS therefore hard-codes a separate visual system.

The existing pending request
`docs/host-capability-requests/sdk-owned-pet-surface-client.md` correctly blocks
publication. It is retained unchanged and cannot be bypassed through a source
rewrite or package rename.

## 3. Boundary decision

The Host may know the public contribution type `contributes.pet`, just as it knows
other public contribution types. It must never know that the selected provider is
named `convax-pet`, `Convax Pet`, or `Violet`.

The rule is:

```text
contribution type and declared grants determine behavior
concrete Plugin identity never determines behavior
```

Consequently, every provider discovery, settings mount, overlay mount, activity
subscription, preference store, managed custom asset, update, rollback, and
uninstall path must work for a second conforming provider with an unrelated id and
name. A concrete-id/name branch is a contract failure, even if it produces the
correct result for the official Plugin.

This phase keeps `contributes.pet` because it is already the public, Manifest-gated
feature boundary and carries a narrower authority surface than exposing generic
desktop windows and cross-project Agent activity to ordinary Web Plugins.
Atomizing it into unrestricted overlay/window/activity APIs is not required for
decoupling and would broaden security scope substantially.

## 4. Considered approaches

### 4.1 Copy Host CSS and remove obvious id checks

This is the smallest patch but is rejected. Copied CSS drifts, and removing only
visible checks does not prove provider-generic lifecycle behavior.

### 4.2 Public Pet provider contract plus public Plugin design foundation — selected

Keep the narrow `contributes.pet` feature boundary, publish an SDK-owned Pet
surface client, and publish a build-time Plugin design foundation shared with
Convax. Add conformance tests using two unrelated provider identities.

This gives the smallest authority surface, preserves immutable Plugin snapshots,
and makes both functional and visual coupling explicit and versioned.

### 4.3 Replace Pet with generic desktop-window, activity, storage, and asset APIs

This is more mechanically generic but is rejected for the current phase. It would
expose security-sensitive primitives independently, require several new grants,
and make ordinary Plugins compose a global cross-project desktop feature. It may
be reconsidered only if multiple non-Pet products demonstrate the same need.

## 5. Target architecture

```text
convax-pet author source
  Pet product UI, animation, state mapping, collection, copy
  imports published Pet client and Plugin UI foundation
                 |
                 | build bundles exact dependency versions
                 v
immutable convax-pet Plugin snapshot
  contributes.pet + static overlay/settings/library/assets
                 |
                 | contribution-scoped SDK connection
                 v
generic Host Pet-provider platform
  validates contribution, grants, snapshot and surface
  owns native window/activity/navigation/storage security boundaries
  contains no concrete Plugin id, name, artwork or Pet product copy
```

### 5.1 Plugin ownership

The Plugin owns:

- overlay and settings DOM, layout, copy and accessibility;
- activity priority and state-to-animation mapping;
- sprite timing, reduced-motion presentation and drag gesture production;
- bundled and custom collection composition;
- selection, empty, loading, error and confirmation states;
- all Pet-specific naming, badges, labels and artwork;
- use of the public Plugin design foundation.

### 5.2 Host ownership

The Host owns only contribution-scoped native/security work:

- validation and singleton arbitration of any `contributes.pet` provider;
- exact installed-snapshot and surface identity;
- sandboxed native overlay lifecycle and display positioning;
- content-free activity projection and validated navigation;
- bounded preferences and managed custom-asset storage;
- update, rollback, uninstall, crash and shutdown ordering.

The Host must not own bundled pets, Pet cards, animation selection, product copy,
collection composition, or branches keyed by package id/name.

## 6. Public contract requirements

### 6.1 SDK-owned Pet surface client

The existing pending request remains the source of truth. Its accepted result must
let author source import a public Pet client for overlay and settings surfaces.

The client must:

- derive the installed Plugin snapshot from the trusted connection rather than an
  author-supplied concrete Plugin id;
- accept only the declared surface (`overlay` or `settings`);
- own request ids, bounds, pending calls, cancellation, close, response parsing,
  event parsing, and late/duplicate response policy;
- expose only operations admitted by the manifest grants and surface allowlist;
- fail closed on stale identity, wrong surface, invalid messages, unsupported
  operations, cancellation, close, and provider replacement.

Pet author source must contain no raw `MessagePort`, `postMessage`, protocol
envelope, pending map, or `convax.pet-host/1` parser after migration.

### 6.2 Public Plugin design foundation

The Host design owner should publish a browser-safe package intended for sandboxed
Plugin author source, provisionally named `@convax/plugin-ui`. The final name is a
human-owned contract decision.

It is consumed at build time and bundled into the immutable Plugin snapshot. The
Host must not inject mutable global CSS into an installed Plugin, and the Plugin
must not import Host-private React components or source paths.

The first public foundation should contain:

- semantic color tokens for canvas, surface, elevated surface, border, primary
  and secondary text, accent, success, warning, danger, disabled and focus;
- typography families, sizes, weights and line heights;
- spacing, radius, shadow, control-height and motion-duration tokens;
- light and dark token sets;
- focus-visible, reduced-motion and disabled-state behavior;
- CSS recipes for button, icon button, card, badge, field, notice, empty state and
  scroll container;
- a documented versioning policy and a standalone browser fixture.

The package supplies visual primitives, not Pet components. `PetCard`, the
companion hero, sprite stage and activity tray remain Plugin-owned compositions.

If Convax has an app theme independent of the operating-system color scheme, a
separate generic appearance context is required. The Plugin must not guess that
theme or read Host DOM. Until such a published context exists, the contract may
support only the documented system light/dark behavior.

Because no such public package or Catalog appearance API exists today, this is a
publication blocker and requires its own structured human-reviewed request before
implementation claims exact Host alignment.

## 7. Pet surface design alignment

### 7.1 Settings

Pet Settings should read as a native Convax settings surface, not a separate
marketing page:

- one restrained page header and description;
- one current-companion summary using standard surface/card tokens;
- one clear Wake/Tuck primary action;
- one collection section with a standard action row and responsive cards;
- standard badges for bundled/custom and standard inline confirmation for removal;
- standard loading, disconnected, validation and empty states;
- no decorative gradients, bespoke purple shadows, arbitrary radii, or duplicated
  typography values outside the public foundation.

### 7.2 Overlay

The sprite remains visually distinct artwork. Every surrounding control must use
the public foundation:

- compact status pill with semantic state color and text/icon cue;
- elevated activity tray with standard surface, border, radius and shadow;
- standard icon button, focus ring, rows, scrollbar and empty state;
- reduced motion and keyboard behavior inherited from the public rules;
- no style derived from the concrete provider identity.

## 8. Data and lifecycle flow

1. Installation validates a provider solely from manifest schema, contribution,
   grants, package files and immutable bytes.
2. Provider activation selects one contribution through generic singleton
   arbitration; it does not compare ids or names.
3. The Host mounts the declared surface and transfers an SDK-owned connection
   bound to the exact provider generation and surface.
4. Plugin code reads bounded state and renders with bundled design-foundation
   assets.
5. Mutations pass through typed SDK operations; the Host validates grant, surface,
   generation and payload before applying native work.
6. Updates revoke the old generation, validate and publish the new snapshot, then
   reconnect. Rollback restores the previous provider generically.
7. Uninstall closes both surfaces and removes provider-owned runtime state through
   contribution lifecycle rules, without package-specific cleanup.

## 9. Failure handling

- Missing published Pet client or UI foundation: package stays blocked; no legacy
  fallback is added.
- Required operation unavailable: show a bounded disconnected/unavailable state
  and make no mutation claim.
- Invalid or stale connection: close, reject pending work and wait for a new
  provider generation.
- Design package unavailable during a clean frozen install: fail build and
  publication rather than use copied local files.
- Unsupported theme context: use only the public documented fallback; never infer
  Host internals.
- Provider conflict: resolve through contribution-level selection, never official
  package preference.

## 10. Migration sequence

### Phase A — this repository, before Host approval

1. Approve this architecture specification.
2. Retain the existing SDK Pet-client request unchanged.
3. Create a separate append-only request for the public Plugin UI foundation. Its
   first version follows the documented operating-system light/dark preference;
   synchronizing a separate app-only theme is outside this migration.
4. Bind requests to the exact affected `convax-pet` version through workspace and
   policy declarations.
5. Keep publication blocked; do not add a copied-style or raw-transport fallback.

### Phase B — separate human-approved Host/public-package work

1. Publish the generic SDK Pet client and its conformance suite.
2. Publish the browser-safe Plugin UI foundation and versioning documentation.
3. Prove Host provider lifecycle with at least two unrelated fixture identities.
4. Prove there is no runtime behavior keyed by the official Plugin id or name.
5. Publish external decision receipts, package digests and runtime evidence.

This phase is not authorized by the Plugin task.

### Phase C — resume Plugin work after published contracts exist

1. Move Pet author code under a source/build boundary.
2. Import and bundle the exact published Pet client and UI foundation.
3. Remove handwritten transport and concrete-id connection input.
4. Replace hard-coded UI foundation values with public semantic tokens/recipes.
5. Preserve Pet-owned layout and behavior while aligning controls and states.
6. Bump Plugin SemVer and run the complete publication verification set.

### Phase D — compatibility removal

After the new Plugin and minimum Host version are released, remove only obsolete
legacy transport compatibility through a separate Host-owned change. Do not add a
dual protocol to the Plugin.

## 11. Verification

### Plugin repository

- source scan rejects raw `MessagePort`, `postMessage`, handwritten protocol
  envelopes, pending request maps, and concrete-id connection input;
- clean build proves only published exact SDK/UI packages are consumed;
- CSS contract test rejects foundation color, radius, shadow, font and control
  literals outside explicitly allowed sprite/layout values;
- settings and overlay tests cover every state, action, cancellation, failure,
  keyboard path, focus state, reduced motion, light and dark appearance;
- package validation, workspace tests, companion build, repository tests, pack,
  Skill API check, Marketplace Kit check, Official v2 build and Builtin bundle all
  pass from a frozen install.

### Separate Host/public-package conformance

- two unrelated Pet provider ids and names produce identical lifecycle behavior;
- changing only provider id/name changes no branch, permission or presentation;
- wrong surface, snapshot, grant, generation, payload, cancellation and late
  response fail closed;
- install, update, rollback, uninstall, crash and restart use contribution identity
  only;
- public UI fixture matches the approved Convax design reference in light, dark,
  focus, disabled, error and reduced-motion states;
- no test imports or asserts the official Pet package id except as inert fixture
  data.

## 12. Acceptance criteria

The redesign is complete only when:

- Host runtime behavior contains no branch keyed by `convax-pet`, `Convax Pet`,
  Violet, or another concrete provider identity;
- a second conforming provider works without Host source changes;
- Pet surfaces use a published SDK client and contain no handwritten transport;
- Pet controls use the published Convax Plugin design foundation rather than copied
  Host CSS or bespoke foundation values;
- Pet-specific product semantics remain entirely in the Plugin;
- Plugin publication is blocked honestly until all pending requests have verified
  human decisions and published contract evidence;
- neither repository adds a Plugin-id-specific compatibility path.

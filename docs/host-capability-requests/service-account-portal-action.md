# Host contract requirement: application-scoped service account portal action

## User problem

A connected Service needs a visible **Profile** action in its Host-rendered account
surface. Activating it must open that Service's Application-scoped end-user portal.
For Convax, the destination is the AuthX ProjectUser Portal at
`/account/projects/{projectId}`. It must never fall back to the global AuthX Account
page at `/account/profile`, and a ProjectUser must not be exposed to developer
Workspace, Application, environment, or management navigation.

## Missing generic contract

- Current Catalog version: `@convax/plugin-api` `3.0.0`; current authoring ABI:
  `@convax/plugin-sdk` `0.2.0` with `convax.plugin/8`.
- Closest published contracts: the closed Service action list contains only
  `authorize`, `reauthorize`, `authorization.cancel`, `checkout`, and `sign_out`.
  The `checkout` action can open a Main-only hosted URL, but it has payment semantics
  and cannot be reinterpreted as account navigation.
- Exact missing capability or contribution: a generic portable Service `profile`
  action, a fixed `service.profile` companion operation, and a typed result carrying
  one browser destination owned by the Service integration.
- Intended audiences: Plugin authors at authoring time; Desktop Main and a verified
  Service companion at runtime. Renderer receives only action availability and the
  Host-owned label, never the destination URL.
- Scope and side effect: one exact active Plugin snapshot and Service instance;
  read-only external navigation initiated by an explicit user click.
- Required grant: no new data, filesystem, credential, Canvas, or Agent grant. The
  existing installed Service principal and explicit user gesture are required.
- Bounded request and response: the request has no caller-supplied URL or Project
  identifier. The companion returns one length-bounded HTTPS URL in a closed result
  schema. The Host keeps it Main-only and opens it through the existing external
  browser boundary.
- Stable errors: undeclared action, unavailable Service, unsupported operation,
  invalid or non-HTTPS destination, stale Plugin snapshot, cancelled navigation,
  and companion contract mismatch.
- Cancellation and stale-scope behavior: update, disable, uninstall, or Service
  replacement before browser dispatch cancels the action. A late response from an
  old runtime generation is rejected and opens no URL.

## Alternatives

- Linking `/account/profile` is incorrect because that is AuthX's global Account
  surface rather than an Application-scoped ProjectUser Portal.
- Reusing `checkout` would mix read-only account navigation with payment semantics.
- Reusing `authorize` or `reauthorize` would start an OAuth lifecycle unnecessarily.
- Returning a URL through status metadata would expose an undeclared navigation
  capability and let passive status reads become authority.
- A Web Plugin could render its own link only by adding an unrelated iframe surface;
  it would duplicate the Host-rendered Service account UI and widen the integration.

## Security and compatibility

The installed Plugin snapshot remains the principal. The companion derives the
destination from its immutable, validated Application profile; renderer, Canvas
state, query parameters, remote status payloads, and user input cannot select an
origin, Project, or URL. No token, credential, Workspace id, billing identifier, or
return URL is embedded in the destination.

The change extends the closed Plugin Service contribution and fixed companion
protocol, so the SDK/Host owners must publish an additive compatible contract or a
new manifest schema according to their compatibility policy. An older Host must
reject a Plugin declaring `profile`; it must not silently hide the action and claim
the package is fully supported. Host behavior must remain generic and contain no
Convax, AuthX, Nexus, vendor, Project id, or Plugin id branch.

## Falsifiable acceptance tests

1. A generic fixture declaring `profile` validates, exposes one Host-rendered
   Profile action, invokes only its exact leased Service companion, and opens the
   returned HTTPS portal URL without exposing that URL to Renderer.
2. An undeclared action, HTTP URL, credential-bearing URL, caller-selected URL,
   stale runtime response, cancellation, disable, update, or uninstall opens no
   browser and returns a stable failure.
3. The proposal must be rejected or mapped to an existing public contract if the
   released SDK can already add a distinct Profile action to a Host-rendered Service
   card without reusing checkout/authorization or introducing a Web surface.

## Automated publication transition

- Exact affected package versions: none authored yet. The currently published and
  product-locked `plugin/nexus-service@1.0.10` remains unchanged and ready. The
  first version declaring this action must be assigned only after the public
  contract exists, then bound in `registry/host-capability-policy.json` before its
  implementation starts.
- Technical blocker while the contract is absent: `missing-host-contract`; the
  current SDK rejects `profile` as an unsupported Service action and defines no
  typed `service.profile` result.
- Expected Catalog API ids: none if this remains a declarative Service contribution
  and fixed companion operation; otherwise the Host owner must publish and document
  the selected generic API id.
- Once published, exact Catalog contract digests: none for package-conformance, or
  the exact generated digest if the Host owner chooses a Catalog API.
- Plugin-side changes after the generated Catalog satisfies the requirement: bind
  the newly assigned exact package version to this request, add
  `profile` to the Convax Service manifest, implement `service.profile` in the Nexus
  companion from its validated AuthX Application profile, return only
  `/account/projects/{projectId}` on the pinned issuer, add contract and browser
  navigation tests, remove the technical blocker, and release a new immutable
  package version if required by the final ABI.

Do not add a reviewer, approval status, receipt, Environment, or manual bypass.
The exact package becomes ready only when current Catalog/package validation passes
and the technical blocker is removed.

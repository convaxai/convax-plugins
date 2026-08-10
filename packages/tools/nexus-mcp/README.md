# Convax Nexus MCP

First-party Convax companion for Nexus Hosted Auth and its OpenRouter protocol Gateway.

The Host actively loads text-output models through the declared `openrouter`
Provider protocol. The companion independently requests OpenRouter's dedicated
`/images/models` and `/videos/models` catalogs through Convax; it does not derive
one media catalog from another endpoint. Image generation uses the dedicated
`/images` API, while video generation uses the asynchronous `/videos` submit,
poll, and content workflow.
Only validated generated artifacts cross back to the Host. When either live media
catalog is bounded, the companion marks its model field so the Host can present
each model as a direct choice. An unavailable or oversized catalog omits that
generation family from `tools/list` instead of exposing a free-text model field.

The companion keeps the validated media catalogs, Provider route, and short-lived
Data Token together in one bounded in-memory route. The `tools/call` that follows
`tools/list` reuses that exact route and never repeats authorization, Provider, or
model discovery inside the generation call. Route credentials remain private to
the companion and are invalidated before their token refresh window.

Each image request sends the host operation id as `x-nexus-request-id` for safe
diagnostic correlation. A rejected request exposes only its HTTP status, an
allow-listed Gateway error code, and that locally generated operation id to the MCP
caller. Response-provided identifiers, raw upstream messages, response bodies,
prompts, and tokens never cross that diagnostic boundary.

The companion owns PKCE and the loopback callback, stores the rotating Nexus refresh
grant in a private user file, and exposes only a random loopback Gateway credential to
the Convax host. Provider credentials remain encrypted in Nexus.

The Service projection uses `convax.plugin-service-status/2`. It reads the current
Nexus Plan, quota, subscription state, and allowlisted Checkout Plans from the
authorized User API. AI budget balances are displayed in USD; during a rolling
Nexus upgrade, legacy micro-USD quota fields are converted locally instead of being
shown as raw quota units. The fixed `service.checkout` tool accepts only one advertised
Plan key, reuses a private idempotency key for retries, and returns a Checkout URL
only to Convax Main for strict HTTPS validation and system-browser navigation.
Redirect Checkouts open the Provider URL directly. QR Checkouts open the trusted
Nexus Account Portal, which restores that Checkout and renders its native payment
code without exposing a non-HTTPS Provider URL to the Convax host.
Neither the retry record nor any Renderer-facing value contains a Nexus token,
Provider Product id, payment credential, or Checkout URL.

During a rolling Nexus API upgrade, a deployment may still return the base Access
shape without embedded Plan or Billing metadata. The companion continues to verify
the Workspace, Provider, and dedicated Quota endpoint in that case, reports Plan
and Billing as unavailable, and enables Checkout only after Nexus advertises its
authoritative allowlisted Plans.

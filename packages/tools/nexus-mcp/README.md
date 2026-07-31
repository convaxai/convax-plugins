# Convax Nexus MCP

First-party Convax companion for Nexus Hosted Auth and its OpenAI-compatible Gateway.

The companion requests the complete OpenRouter model catalog through Nexus and
keeps output modalities bounded locally. Text-output models feed the LLM provider;
concrete image-output models populate the host-rendered Nexus image-model control,
while OpenRouter's automatic routers remain available only to the LLM provider. Image
generation uses the already-metered Chat Completions path and returns only validated
embedded image artifacts to the host. Nexus video endpoints remain unavailable
until the service adds a dedicated video Usage Inspector and quota settlement model.
When the live image catalog is bounded, the companion marks its model field so a
compatible host can present each image model as a direct choice. If that catalog
cannot be loaded, has no image models, or exceeds the bounded choice limit, the
companion omits image generation from `tools/list` instead of exposing a free-text
model field.

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

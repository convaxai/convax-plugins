# Convax Nexus MCP

First-party Convax companion for Nexus Hosted Auth and its OpenAI-compatible Gateway.

The companion owns PKCE and the loopback callback, stores the rotating Nexus refresh
grant in a private user file, and exposes only a random loopback Gateway credential to
the Convax host. Provider credentials remain encrypted in Nexus.

The Service projection uses `convax.plugin-service-status/2`. It reads the current
Nexus Plan, quota, subscription state, and allowlisted Checkout Plans from the
authorized User API. The fixed `service.checkout` tool accepts only one advertised
Plan key, reuses a private idempotency key for retries, and returns a Checkout URL
only to Convax Main for strict HTTPS validation and system-browser navigation.
Neither the retry record nor any Renderer-facing value contains a Nexus token,
Provider Product id, payment credential, or Checkout URL.

During a rolling Nexus API upgrade, a deployment may still return the base Access
shape without embedded Plan or Billing metadata. The companion continues to verify
the Workspace, Provider, and dedicated Quota endpoint in that case, reports Plan
and Billing as unavailable, and enables Checkout only after Nexus advertises its
authoritative allowlisted Plans.

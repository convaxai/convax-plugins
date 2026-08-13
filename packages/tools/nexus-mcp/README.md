# Convax Nexus MCP

First-party Convax companion for AuthX identity and Nexus Application Access.
It does not use Nexus Hosted Auth, Product Sessions, Data Tokens, or the User API.

## Identity and service boundary

- The companion is the OAuth public client. It uses AuthX Authorization Code with
  PKCE S256, high-entropy state and nonce, the exact
  `http://127.0.0.1:65051/oauth/callback` listener, and rotating refresh
  credentials. The scope is exactly `openid profile email offline_access`.
  It validates both access and ID tokens through configured discovery/JWKS:
  ES256, `typ=JWT`, known `kid`, signature, exact issuer/audience/Project/
  Environment/client, non-empty `sub`/`sid`/`jti`, bounded `iat`/`exp`, exact
  `token_use`, and the authorization nonce.
- Nexus owns the Application binding. The client uses only `status`, `bootstrap`,
  `inference-key/rotate`, `revoke`, and `checkout`. Mutation bodies are empty;
  durable `Idempotency-Key` values are persisted before dispatch. No request can
  name or override a Workspace, Plan, provider host, Provider Connection, schema,
  or credential.
- `bootstrap` and `rotate` may return `inferenceKeyPlaintext` once. If bootstrap
  replay has no plaintext and Keychain has no matching key, the companion issues
  an explicit rotate with a newly persisted key; it never recreates or replays an
  old secret. Keychain stores the refresh credential, exact provider-scoped
  Gateway Base URL, binding IDs, and current Inference Key. Production has no
  plaintext-file fallback.
- A legacy `convax.nexus-refresh-grant/1` or `convax.nexus-session/1` file is
  deleted when detected. Its credential is never migrated to, or sent to, a new
  endpoint.
- Renderer, Canvas, Project state, tool results, URLs, and logs never receive
  AuthX or Nexus credentials.

## Gateway protocols

The local `llm.gateway.start` endpoint accepts a random Main-only loopback
credential. It forwards only OpenRouter `GET /models` and
`POST /chat/completions` to the provider-scoped Base URL returned by Nexus,
using the stored Inference Key. Client provider-routing fields and arbitrary
Gateway paths are rejected.

Image generation reads `/images/models` and calls `/images`. Audio generation
discovers `GET /models?output_modalities=speech` and calls `/audio/speech` for
raw audio bytes. Both keep the bounded
`x-convax-role: generation-model-id` selection, validates image signatures and
sizes, writes portable relative artifact paths with no-clobber semantics, and
redacts credentials, prompts, and native paths from diagnostics.

The current image tool schema exposes `aspect_ratio`, `background`, `n`,
`output_compression`, `output_format`, `quality`, `resolution`, `seed`, and
`size`. The video schema exposes `aspect_ratio`, `duration`, `generate_audio`,
`resolution`, `seed`, and `size`. Audio exposes `instructions`,
`response_format`, `speed`, and `voice`. These are optional top-level provider controls:
the companion removes only the fixed Convax envelope (`schema`, operation/output
identity, prompt, model, references, and output directory) and forwards every
other JSON value unchanged in the Nexus Gateway body, including nested objects,
arrays, and `null`. Dynamic generation schemas intentionally allow additional
properties, so provider-native controls do not require a companion release.

Video generation reads `/videos/models` and uses `/videos`, task `GET`, task
`DELETE`, and `/content`. `video.generate` declares
`recovery={schema:"convax.generation-lro/1",mode:"long-running-operation"}`.
Only a process with both a matching Keychain account and the Host-provided
`CONVAX_GENERATION_LRO_DIRECTORY` advertises:

- `capabilities.experimental["convax/generation-lro"]` with a stable,
  non-secret account+journal binding;
- `convax/generation/operations/get`;
- `convax/generation/operations/wait`;
- `convax/generation/operations/cancel`;
- `convax/generation/operations/result`;
- `convax/generation/operations/acknowledge`.

Every method consumes exact `convax.generation-lro-request/1`. The initial
`tools/call` trusts only Host `_meta.convaxGeneration.operationId` and
`requestDigest`; business arguments do not define recovery identity. The journal
persists the private provider task ID, provider controls, and result bytes, while
Host `taskId` is a stable random handle. Provider submit sends a stable
`Idempotency-Key` derived
from the Host operation ID and request digest; an ambiguous retry must retrieve
the same provider task before the receipt is persisted. `wait` has no companion
overall timeout, and aborting a wait never cancels an accepted task. Only
`operations/cancel` performs remote cancellation.

`result` validates operation/task/result digests and materializes idempotently
into that request's fresh `outputDirectory`; it never depends on the original
`tools/call` directory. Its digest matches the Host canonical normalized MCP
content plus artifact-byte digest. `acknowledge` returns the exact acknowledgement
schema and removes the bounded journal/result files.

## Application Access wire contract

The companion currently validates this v1 contract:

- AuthX: `GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke`
- Nexus: `GET /api/v1/application-access/status`,
  `POST /api/v1/application-access/bootstrap`,
  `POST /api/v1/application-access/inference-key/rotate`,
  `POST /api/v1/application-access/revoke`, and
  `POST /api/v1/application-access/checkout`
- Gateway: one returned Base URL whose path is exactly
  `/api/v1/gateway/providers/<providerConnectionId>`

Application Access consumes the generated camelCase DTO without a schema
discriminator: `state`, `bindingId`, optional `workspaceAccessId`,
`providerConnectionId`, `gatewayBaseUrl`, `planKey`, `checkoutAvailable`, and
optional safe `inferenceKey` metadata. Bootstrap/rotate add only optional
`inferenceKeyPlaintext`; Checkout uses `id`, `provider`, `status`, optional
`action`, and `expiresAt`.

`bun run contract:check` reads the current AuthX fixture/schema/export/runtime,
Nexus generated Application Access and Gateway OpenAPI plus controller, and
Convax Host LRO source. Override repository locations with
`CONVAX_AUTHX_REPOSITORY`, `CONVAX_NEXUS_REPOSITORY`, and
`CONVAX_HOST_REPOSITORY`.

## Local development

Production AuthX client/issuer, Nexus origin, and Gateway origin are fixed in the
binary. Local injection is loopback-only and requires the exported AuthX fixture:

```sh
CONVAX_NEXUS_LOCAL_DEVELOPMENT=1 \
CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE=/absolute/path/to/authx/packages/contracts/fixtures/convax-local-public-client.json \
CONVAX_NEXUS_ORIGIN=http://127.0.0.1:3000 \
CONVAX_NEXUS_GATEWAY_ORIGIN=http://127.0.0.1:4000 \
CONVAX_GENERATION_LRO_DIRECTORY=/absolute/private/host-provided-directory \
bun run build
```

The profile supplies the exact local client ID, issuer, JWKS URI, Project,
Environment, scopes, and registered callback. Local Nexus/Gateway origins must be
plain loopback HTTP. Use Nexus `tests/fake-provider` behind the provider-scoped
Gateway; do not configure a paid provider.

Run the companion checks with:

```sh
bun run typecheck
bun run contract:check
bun run test
bun run build
```

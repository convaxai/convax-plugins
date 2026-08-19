# Convax Plugin authoring guard

Use the standalone `convax-plugin-authoring` Skill when creating, modifying, or
debugging this Plugin. Verify every Host API against the generated Catalog,
including its `since`, `audience`, grant, scope, side effect, and availability.

If the required generic API or contribution point is absent, mark publication
blocked and describe one generic Host contract requirement in this Plugin
repository from the Skill's `references/host-contract-requirement.md` template. Add its id to
this workspace's `package.json#convax.hostCapabilityRequests` and bind the exact
package version in `registry/host-capability-policy.json`. Do not invent a method,
reuse a legacy transport, inspect Host implementation, or switch to the Host
repository from this Plugin task. A separate Host-owned task may add the generic
contract; current Catalog/package validation then clears the technical blocker and
publishes automatically, without an approval receipt or Environment.

Canvas UI commands have one canonical definition in
`contributes.canvas.commands`. `toolbar` and `menus` are placement-only arrays
whose `command` fields reference those definitions. Keep `title`, the optional
Host icon token, and the `renderer-message` target on the command; never repeat or
override them in a placement, and do not add legacy inline toolbar/menu objects.
Menus may use only the owning node's `overflow` placement.

Activation sends the command target's message to this Plugin's live sandbox
renderer over the bundled `@convax/plugin-sdk/client` ABI
`convax.plugin-host/8`; it cannot target a Host function and does not grant a Host
API. `src/plugin-host-client.js` is the author source and
`package/assets/plugin-host-client.js` is deterministic generated output.
`package/assets/app.js` imports only that local output, handles commands with
`client.onCommand`, and independently calls the manifest-declared
`host.context.get` API.

Run `bun run build` after authoring changes and commit the generated asset. Run
`bun run build:check` in review and release checks. Never hand-edit the generated
client or implement protocol envelopes, request ids, pending request maps,
`postMessage`, response parsing, or cancellation outside the SDK.

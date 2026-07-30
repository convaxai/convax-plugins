# StoryAI 3D Director Desk vendoring

The static application in this directory is built from:

- repository: `https://github.com/jiguang132/storyai-3d-director-desk`
- upstream commit: `8c8bd361790be4d37158a7430365e65546e358fe`
- upstream package version: `0.0.1`
- source license: MIT, Copyright (c) 2026 YZ

This is not the private MiniMax Hub `3d-director-stage` plugin. Convax uses the
open-source project as an independent built-in Plugin and does not copy MiniMax
Hub assets or code.

The Convax build differs from upstream in nine deliberate ways:

1. it bundles `createPluginHostClient` from `@convax/plugin-sdk/client` and uses
   its `convax.plugin-host/8` MessageChannel instead of handwritten request,
   response, pending-map, or wildcard parent-window messaging;
2. portable scene state and the director viewport camera are kept separate inside
   one owning Canvas-node snapshot, with schema-v1 migration, schema-v2 hydration,
   early host connection, bounded snapshots, gesture-end flush (including a final
   snapshot while an intermediate write is in flight), timeout/retry and fail-closed
   schema handling;
3. browser `localStorage` persistence and the upstream wildcard host-capture
   messages are disabled inside the opaque-origin sandbox;
4. the bundled Sketchfab Standard mannequin is omitted. The MIT-licensed
   procedural mannequin remains available, avoiding redistribution of a model that
   is not itself open source;
5. local model import and image-download controls are hidden until scoped host
   capabilities can support them without relaxing the Plugin CSP or iframe sandbox;
6. the MessageChannel handshake accepts only the parent host and this exact Plugin
   id before treating the transferred port as a scoped capability token.
7. session-only local media and camera captures remain usable, but surface a visible
   portability warning instead of silently pretending their browser URLs persist.
8. the Canvas-owned Play toolbar command captures exactly the current viewport,
   then requests one scoped, managed Canvas image connected from the owning Plugin
   node; concurrent clicks and invalid or stale host scope fail closed.
9. a package-owned `assets/convax-theme.css` layer maps the generated UI onto the
   Convax Midnight semantic tokens without editing the pinned upstream stylesheet;
   the trusted bundle transform also resolves the Three.js grid from
   `--ui-border-default` instead of retaining an unrelated fixed blue.

The complete static Plugin package lives under
`packages/plugins/storyai-3d-director-desk/package/` in the
`microvoid/convax-plugins` repository. The deterministic release ZIP is installed
through the ordinary Convax Registry lifecycle. Convax Desktop does not carry a
second static bundle or reserve this package as a built-in id. The iframe never
executes code from a development dependency or Node module.

The consolidated `UPSTREAM.patch` makes the application import a build-external
`./plugin-host-client.js` module and use only its `callHostApi` and `onCommand`
surface. The repository build supplies that module from the pinned
`@convax/plugin-sdk/client`; the standalone upstream demo uses an inert adapter.
The upstream-generated JavaScript is preserved byte-for-byte as `vendor/app.js`.
The trusted `scripts/build.ts` step builds the SDK client, replaces inert remote
documentation literals, splits XML namespace identifiers, and replaces the four
bundled generic `fetch` loaders with an explicit local rejection, then maps the
fixed grid color to the package-owned semantic theme before publishing
`package/assets/app.js`. Do not hand-edit generated files or the
upstream-generated stylesheet. The checked-in inputs and outputs are pinned by
these SHA-256 hashes:

- `vendor/app.js`: `ca87a7d8f2666eaf728dd5ea9ae7078821996d032140c4437ce5047e7bba65a1`
- `package/assets/app.js`: `2fe096047aa10f51dbbf92ad2542b97ed4d73437bd281867f277e9027bd7b22f`
- `package/assets/plugin-host-client.js`: `b7d26c08bafb0635a9eff4f146d08ffe2daa59ac536e17ba91b79374336be9dc`
- `assets/convax-theme.css`: `a27a031b299856bd4bd6d31b7cbb54e9996e0679e13db14ae3945197b1de41af`
- `assets/styles.css`: `6cce301d037ab3483cda7a5d1587fcd6258e59e7baee4ed6d8b17fc080ac8620`
- `index.html`: `9bdc8343951384b999fdcd86e489a5f52ad3eb1648d9362ee5e9246345a732b6`
- `UPSTREAM.patch`: `e3d10db792f0dd5d020bad84a60cb5f393451a0cbdd8d598c84ee17be3cd07bd`

To rebuild, check out the pinned commit and apply the consolidated
`UPSTREAM.patch`. Remove `public/models/` so Vite cannot copy the non-open
mannequin, run `npm ci` from the upstream lockfile, and run `npm test -- --run
src/editor/io/hostBridge.convax.test.ts` plus `npm run build`. Review the output,
replace `vendor/app.js`, and run `bun run build` in this package to produce the
offline Registry assets. Update every hash above only after reviewing both stages;
toolchain differences can change minified bytes even when behavior is unchanged.

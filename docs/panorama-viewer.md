# Panorama Viewer ownership and release

`packages/plugins/panorama-viewer` is the only source tree for the Panorama
Viewer product. Its HTML, CSS, JavaScript, WebGL renderer, manifest, localized
title, toolbar commands, tests, package metadata, and release ZIP all live in
this repository.

Convax Desktop owns only generic host capabilities used by this and other
Plugins:

- the `@convax/plugin-sdk/client` `convax.plugin-host/8` MessageChannel and
  `host.context.get`;
- `canvas.inputs.list` plus `canvas.inputs.changed` for pathless direct-input
  metadata and opaque `inputKey` values;
- the `canvas.inputs.image.open`/`canvas.inputs.image.close` lifecycle, pending
  generic Host admission for direct image inputs;
- `canvas.node.state.replace` for bounded Plugin-owned view state;
- `canvas.resource.image.create` for one validated PNG;
- managed Project asset admission and rollback;
- revision-checked Canvas image-node creation and connection;
- sandboxed Plugin frames, fullscreen policy, and manifest-driven text toolbar
  buttons.

Desktop must not carry a second Panorama Viewer static bundle or reserve
`panorama-viewer` as a built-in id. Version `0.3.0` targets clean/current profiles
but remains publication-blocked pending the generic Web image-input capability
review. Once admitted, it is installed only as an ordinary Registry package. This
release deliberately does not migrate profiles created by the unreleased trusted
built-in implementation; those experimental profiles must remove the old
installation or be reset before installing this repository's licensed release
package.

## Verification

Run the repository's complete release gate:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
```

The Panorama package tests additionally assert that the ZIP inventory is static
and offline, the manifest requests only the documented capabilities, and current
viewport capture calls `canvas.resource.image.create`. Until the image-input
capability is approved, source admission reports the package as blocked, exact
packing rejects it, and Marketplace/release output omits it. End-to-end Electron
acceptance after approval must install the packed `0.3.0` artifact through a
validated Registry entry, exercise list/open/close with an opaque `inputKey`, and
verify that the installed summary does not contain `trustedBuiltin`.

# 3D Director Desk ownership and release

`packages/plugins/storyai-3d-director-desk` is the only source tree for the
StoryAI 3D Director Desk integration. Its pinned upstream evidence, Convax patches,
HTML, CSS, generated JavaScript, manifest, legacy companion Skill, tests, showcase
media, package metadata, and release ZIP all live in this repository.

Convax Desktop owns only the generic host capabilities used by this and other
Plugins:

- sandboxed static Web Plugin frames and manifest-driven Canvas renderers;
- bounded Plugin-owned Canvas node state;
- `canvas.image.create` for one validated PNG;
- managed Project asset admission, Canvas image-node creation, connection, and
  rollback;
- manifest-driven Canvas toolbar commands.

Desktop must not carry a second 3D Director Desk bundle, its Skill/showcase assets,
or reserve `storyai-3d-director-desk` as a built-in id. Version `0.1.0` is the
first stable Registry release and targets clean/current profiles. It deliberately
does not claim or rewrite installations made from the earlier unreleased trusted
built-in versions; those experimental profiles must remove the old installation
or be reset before installing this Registry package.

The package retains `convax.plugin/1` and the top-level `skill` field so the
companion Skill remains independently managed, matching the pre-migration
lifecycle. This source-ownership move does not grant new capabilities or transfer
the Skill to Plugin-owned v4 lifecycle semantics.

The unreleased built-in manifest used a host-private `icon: "play"` hint on its
toolbar item. Registry validation intentionally accepts only the public
`id`/`title`/`command` contract, so the stable release keeps the same
`scene.play` behavior and visible title without that private hint.

## Upstream and static-byte boundary

The browser application is pinned to upstream commit
`8c8bd361790be4d37158a7430365e65546e358fe` from
`jiguang132/storyai-3d-director-desk`. `package/UPSTREAM.md` records the exact
patch sequence, omitted non-open model, generated-file hashes, and rebuild
procedure. Generated JavaScript and CSS are reviewed release inputs; do not
hand-edit them.

## Verification

Run the repository's complete release gate:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
```

The package-specific tests additionally pin the upstream evidence and generated
hashes, reject remote/runtime content, validate the smallest host capability set,
and check the deterministic static package inventory.

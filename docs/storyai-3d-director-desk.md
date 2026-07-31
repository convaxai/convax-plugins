# 3D Director Desk ownership and release

The StoryAI 3D Director Desk integration has two authoritative source workspaces:

- `packages/plugins/storyai-3d-director-desk` owns the pinned upstream evidence,
  Convax patches, HTML, CSS, generated JavaScript, v8 manifest, showcase media,
  Plugin metadata, and Plugin release ZIP;
- `packages/skills/storyai-3d-director-desk` owns the portable Agent Skill,
  `convax.package/2` Skill metadata, and generated capability reference.

The Plugin packer injects the owned Skill into the Plugin ZIP. The Plugin directory
must not contain a copied `SKILL.md` or Skill tree.

Convax Desktop owns only the generic host capabilities used by this and other
Plugins:

- sandboxed static Web Plugin frames and manifest-driven Canvas renderers;
- bounded Plugin-owned Canvas node state;
- `host.context.get` for the negotiated Host API major 2 profile;
- `canvas.node.state.replace` for bounded Plugin-owned state;
- `canvas.resource.image.create` for one validated PNG;
- managed Project asset admission, Canvas image-node creation, connection, and
  rollback;
- manifest-driven Canvas toolbar commands.

Desktop must not carry a second 3D Director Desk bundle, its Skill/showcase assets,
or reserve `storyai-3d-director-desk` as a built-in id. The current authoring
version is `0.2.0` and targets the `convax.package/2` and `convax.plugin/8`
publication path.

The manifest declares the independent Skill workspace through
`contributes.skills` and the Skill metadata binds back with
`ownerPluginId: "storyai-3d-director-desk"`. Convax installs, updates, and removes
that Skill atomically with its owner Plugin, while the standalone Skill ZIP remains
portable to compatible Agent Skills clients.

The owned Skill omits `uses`. All StoryAI Host APIs are Web-only, so none may be
copied into an Agent Skill reference. The Skill source keeps stable links but must
not author the reserved generated reference files. At build or publication,
`@convax/marketplace-kit` uses the SDK renderers to inject pages stating that no
Agent Host API, Plugin tool, or inter-Plugin capability is declared. Those bytes
participate in both the Skill artifact and owner Plugin snapshot digest and are
never rewritten in an installed Skill after a Host upgrade.

Pre-v8 manifests and the top-level `skill` field are historical Registry
consumption only. They must not reappear in StoryAI authoring source, templates,
or new release candidates.

The unreleased built-in manifest used a host-private `icon: "play"` hint on its
toolbar item. Registry validation intentionally accepts only the public
`id`/`title`/`command` contract, so the stable release keeps the same
`scene.play` behavior and visible title without that private hint.

Version `0.2.0` adds a package-owned visual layer that uses Convax's Midnight
semantic color, typography, radius, shadow, focus, contrast, and reduced-motion
tokens. The layer stays separate from the pinned upstream-generated stylesheet,
and the trusted build maps the Three.js grid to the same semantic border role.

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
bun run skill-api:check
bun run check
```

The package-specific tests additionally pin the upstream evidence and generated
hashes, reject remote/runtime content, validate the smallest Web Host API set and
owned-Skill boundary, and check the deterministic static package inventory.

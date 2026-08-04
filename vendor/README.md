# Host authoring package candidates

The workspaces under `host-packages/` are temporary CI inputs for the coordinated
Plugin v8 cutover. Their compiled public files are extracted from real npm tarballs
built by `convaxai/convax`; this repository does not own or modify their source.
Only their internal `@convax/*` dependency protocols are changed to `workspace:*`
so a clean checkout can install the coordinated candidates without a private
repository token or unpublished npm packages. Source-only scripts and development
dependencies are removed so these workspaces behave like installed release
artifacts rather than importing the Host repository's toolchain.

Plugin validation binds the generated Host API Catalog by version and digest.
The admitted closure currently contains six reviewed release packages:
`bounded-value@0.1.0`, `marketplace@0.2.1`, `marketplace-kit@0.2.2`,
`plugin-api@3.0.0`, `plugin-sdk@0.1.1`, and `plugin-ui@0.1.0`.
While the required public npm packages return 404, protected publication emits
and attests one `convax.vendored-host-package-closure/1` document that binds the
commit, lockfile, exact installed workspace resolutions, Catalog digest, and all
admitted package bytes. This is a temporary package-delivery exception only; it
does not relax Host capability approval. Replace these candidate workspaces with
the same published npm versions after the Host packages are released.

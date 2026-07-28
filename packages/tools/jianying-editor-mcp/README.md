# Convax JianYing companion

Reviewed local MCP companion for the `jianying-editor` Convax Plugin. It supports
macOS only and exposes three operations:

- `draft.status`: stable observation of the running JianYing draft;
- `media.export`: import host-staged image/video references through a short-lived
  loopback server and the JianYing Deep Link.
- `media.import-selected`: import exactly one host-staged toolbar selection using
  the safe automatic policy: a stable active draft is reused, no active draft
  creates a new one, and ambiguous or changed state fails closed.

This package intentionally has no Canvas, Project, Electron, IPC, renderer,
registry, credential, or persistent staging logic.

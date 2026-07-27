# Convax JianYing companion

Reviewed local MCP companion for the `jianying-editor` Convax Plugin. It supports
macOS only and exposes two operations:

- `draft.status`: stable observation of the running JianYing draft;
- `media.export`: import host-staged image/video references through a short-lived
  loopback server and the JianYing Deep Link.

This package intentionally has no Canvas, Project, Electron, IPC, renderer,
registry, credential, or persistent staging logic.

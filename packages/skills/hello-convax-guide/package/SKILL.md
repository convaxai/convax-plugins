---
name: hello-convax-guide
version: 0.2.2
description: Explain how to verify the Hello Convax Plugin host connection safely.
---

# Hello Convax Guide

See [Convax capabilities](references/convax-capabilities.md) for the generated Host API and Plugin tool availability contract.
See [Plugin capabilities](references/plugin-capabilities.md) for generated Plugin-to-Plugin imports and exports.

1. Confirm that the active Canvas contains a Hello Convax Plugin node.
2. Ask the user to press **Refresh context** in the Plugin surface.
3. A successful test displays `Connected through @convax/plugin-sdk client ABI
   (convax.plugin-host/8)` and the
   current host-scoped Project, Canvas, and owning node context.
4. If it stays disconnected, report that the Plugin frame did not receive its
   scoped MessagePort. Do not work around the host or edit `.convax` state.

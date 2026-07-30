---
name: relight-studio
version: 0.1.0
description: Generate relit variations from a directly connected Canvas image through the Relight Studio Plugin and Convax's installed image-generation tools.
---

# 重打光

Use this Skill when the user wants to relight an existing image with a new light
direction, color temperature, contrast, or cinematic atmosphere.

See [Convax capabilities](references/convax-capabilities.md) for the generated Host API and Plugin tool availability contract.
See [Plugin capabilities](references/plugin-capabilities.md) for generated Plugin-to-Plugin imports and exports.

1. Confirm the active Canvas contains a `relight-studio` Plugin node and connect the
   source image to it with a direct incoming Canvas edge.
2. Choose a lighting preset or refine the light direction, intensity, softness,
   temperature, ambient level, and atmosphere in the Plugin surface.
3. Start generation from the Plugin. It discovers compatible installed image tools
   through `generation.tools.list` and submits the relighting prompt plus the direct
   incoming image through `generation.execute`.
4. The host creates a pending image node beside the Plugin surface immediately,
   then admits the generated image into managed Project assets and replaces that
   pending node. Treat generation as successful only when the host reports the
   created Canvas node id.
5. If no compatible image tool is installed or authorized, explain that generation
   is unavailable and ask the user to install or authorize one; do not claim that a
   preview is a generated result.

Do not edit `.convax` files, pass local paths or credentials, call a vendor directly,
or claim that this Skill grants Plugin permissions.

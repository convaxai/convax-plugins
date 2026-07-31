---
name: relight-studio
version: 0.2.0
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
3. Start generation only through the Plugin surface. Treat the generated Convax
   capability reference as the sole description of the current generation API
   contract and use the Plugin's live availability/error state as authoritative.
4. Treat a run as successful only when the Plugin reports a completed Host result.
   A local preview is not a generated result.
5. If the Plugin reports that generation is unavailable, stop and explain that
   current-session availability failed. Do not infer permission from this Skill or
   ask the user to bypass Host setup, authorization, or policy.

Do not edit `.convax` files, pass local paths or credentials, call a vendor directly,
or claim that this Skill grants Plugin permissions.

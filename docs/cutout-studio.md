# Cutout Studio

Cutout Studio is a first-party headless local image-background-removal Plugin. It
declares one Canvas selection action in the same style as `ffmpeg-tools`. The
separately installed `convax-cutout-mcp` companion performs all inference locally
and returns a transparent PNG through the ordinary `convax.generation-call/1`
contract.

## Package boundary

- Plugin: `packages/plugins/cutout-studio`
- Companion tool: `packages/tools/cutout-mcp`
- Plugin ABI: `convax.plugin/8`
- Runtime command: `convax-cutout-mcp`
- Operation: `background.remove`
- Input: exactly one host-staged `reference_image`
- Output: one original-size `image/png`
- Supported release target: macOS 13.4+ on Apple Silicon

Selecting an image node exposes the manifest-declared **抠图** Canvas action.
One click stages that exact image as `reference_image`, runs `background.remove`,
and creates a connected pending image node beside the source. The source is never
modified. The new image node owns the complete scan, inference, dissolve, success,
failure, cancellation, and retry lifecycle before becoming the transparent PNG.
There is no Plugin iframe or second action inside a Plugin surface.

The v8 declaration uses one generic image selection operation with
`editor: "immediate"`, `presentation: "cutout-scan"`, and exactly one
`background.remove` step. The referenced non-return generation tool outputs one
image and accepts `reference_image`; the Plugin does not invent a Host call or
branch Host behavior on `cutout-studio`.

## 不可变更的交互与验收契约

实现必须参考 `ffmpeg-tools` 的 Canvas selection action 风格，并严格按以下顺序执行：

1. 用户点击源图片节点上的 **抠图** 后，立即在源节点旁新建一个图片节点；源节点不得承载动效，也不得被修改。
2. 新图片节点创建后，立即在该新节点上持续播放光谱扫描动效；本地抠图算法与扫描动效同时并行运行。算法未结束时，扫描必须循环持续，不能只播放一次。
3. 抠图结果就绪后，停止光谱扫描，并在同一个新图片节点上播放仅作用于被移除背景区域的粒子消散动效；前景主体保持稳定。
4. 粒子动效结束后，移除全部过渡层，只在新图片节点中展示最终带透明通道的抠图结果。

这四步的节点归属、先后顺序与并行关系是产品验收标准，不得改成源节点原地处理、先完成算法再创建节点、扫描与算法串行、或跳过粒子动效直接展示结果。

The Plugin ZIP contains only the declarative manifest, licenses, and notices. The
model, inference helper, and ONNX Runtime exist only in the separately published
companion. The companion contains no runtime network path; its exact embedded
resources are expanded into a private temporary directory and checked against
their reviewed raw SHA-256 values before every process lifetime.

## Model selection

The default is the Apache-2.0
[`BritishWerewolf/U-2-Netp`](https://huggingface.co/BritishWerewolf/U-2-Netp)
ONNX model pinned at revision
`7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8`.

Reasons:

- This is the exact model used by the inspected reference implementation.
- Its ONNX weight is only 4,574,861 bytes and inference is fixed at 320×320,
  making it materially faster than the previous 1024×1024 BiRefNet Lite path.
- It supports general salient-object background removal rather than a
  portrait-only system request.
- Its Apache-2.0 license and ONNX Runtime's MIT license fit the reviewed local
  companion distribution.

Compared alternatives:

- BRIA RMBG 2.0 is available for non-commercial use, but remains a roughly
  200-million-parameter, 1024×1024 BiRefNet-family model.
- BEN2 Base is MIT and smaller than BRIA by parameter count, but its published
  1024×1024 ONNX weight is about 223 MiB. It is a quality-oriented replacement,
  not a credible latency reduction for this Apple local path.
- macOS Vision is fast, but it does not reproduce the reference model's exact
  subject selection and Alpha response.

The companion decodes and applies EXIF orientation with ImageIO, scales the source
proportionally into a centered 320×320 black letterbox, normalizes RGB with ImageNet
mean/deviation, and runs U-2-Netp with ONNX Runtime. It selects output `1959`,
min-max normalizes the mask, applies the reference `0.12/0.66` smoothstep Alpha
curve, resizes it back to the original dimensions, multiplies existing source
Alpha, and encodes a premultiplied sRGB PNG.

## Reference-motion specification

The deployed reference client was inspected down to its Worker, CSS and Canvas
particle implementation. The visible image transition is:

1. **Spectrum scan** — a one-third-width cyan/white/lime beam with 6 px blur and
   screen blending repeatedly crosses from `-130%` to `430%` in 1.21 seconds using
   `cubic-bezier(0.4, 0, 0.6, 1)`. A cyan 5% tint breathes between 35% and 70%
   opacity every 1.2 seconds. Both continue for the full model-loading and
   inference lifetime.
2. **Background disintegration** — once the transparent result exists, it is
   placed below the source. Only pixels satisfying
   `max(0, sourceAlpha - resultAlpha) > 0` become particles, so the foreground is
   stable. Deterministic per-pixel delay, direction, travel, lifetime and sine-wave
   sway send the removed original-color background toward the upper right. A
   theme-derived contrast halo keeps light source pixels visible on light Canvas
   themes without recoloring the particles.
3. **Transparent final state** — the particle layer is removed completely. No
   grain or checkerboard remains in the exported result.

Implementation timing from user action:

| Phase | Start | Duration | Motion |
| --- | ---: | ---: | --- |
| Spectrum scan | pending node creation | inference-dependent | repeated 1,210 ms sweeps on the new image node |
| Particle onset | result ready | immediate | result swaps below a background-only particle overlay |
| Background dissolve | result ready | 3,200 ms total | removed original-color pixels decelerate toward the upper right, hold through the first half, then fade gradually |
| Final state | dissolve end | indefinite | new image node contains the transparent PNG only |

If inference takes longer than one sweep, the spectrum scan continues without
imposing an overall inference deadline. Once the real Alpha is available, the
background-only disintegration starts without a blank replacement frame or
permanent noise layer. Completion, explicit failure, or caller cancellation is
authoritative.

## Local validation

The companion build:

1. downloads only the pinned U-2-Netp model and ONNX Runtime HTTPS inputs;
2. validates their exact byte lengths and SHA-256 values;
3. compiles one native macOS arm64 inference helper;
4. gzip-compresses and embeds the helper, model, and ONNX Runtime;
5. verifies the final Mach-O target and the 128 MiB limit; and
6. runs an actual MCP inference smoke that checks the returned PNG artifact.

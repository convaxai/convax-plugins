# Video Timeline Plugin 方案

状态：Implemented through `0.1.5`

目标工作区：

- 具体 Plugin：`packages/plugins/video-timeline`
- 可选的后续渲染 companion：`packages/tools/video-timeline-renderer`
- 缺失的通用宿主能力：在当前插件仓记录自动化 Host contract requirement，
  并在 Catalog contract 尚未存在时保留真实技术 blocker

## 1. 结论

Video Timeline 应当是一个拥有 Composition 的 Canvas Plugin 节点，而不是一种新的
Canvas 基础节点类型，也不应当把视频文件节点原地改造成另一种数据类型。

产品中的“视频转成 Timeline”定义为一次非破坏性物化：

1. 保留原视频节点；
2. 创建一个属于 `video-timeline` Plugin 的 Timeline 节点；
3. 创建 `video -> timeline` 的直接输入边；
4. 在 Timeline 自有 Composition 中创建一条视频轨和一个覆盖素材初始可用范围的
   Clip；
5. 选中并打开新 Timeline 节点。

Composition 卡片节点是 Composition 的事实源，Canvas 媒体节点是素材的事实源，Canvas
连线只表达素材绑定和首次轨道物化。断线不得自动删除已经编辑过的轨道或 Clip。

这沿用 Mediax 已验证的边界：Composition 是独立领域模型，OTIO 是交换边界；
Canvas Node、Track 和 Timeline Item 使用互相独立的身份空间。

### Canvas 卡片与 Timeline 工具边界

Canvas 上的节点默认以 `640 × 520` 的 Composition 视频卡片呈现：

- 16:9 Composition 实时预览；
- 可点击、拖动和键盘逐帧移动的迷你多轨时间轴；
- Composition 名称、视频/音频轨数量、保存状态和时长；
- 播放/暂停、时间码、`Edit Timeline` 与 `Export OTIO`；
- 所有视频、音频素材边直接连接到该卡片。

完整 Timeline 不嵌在 Canvas 节点中。`Edit Timeline` 使用宿主已有的受控全屏能力打开
专用编辑工具；关闭后回到同一张卡片。卡片态与编辑态复用同一个 iframe、Composition
session、播放头和 Preview Controller，因而无需复制状态或创建第二个监视器。轨道移动、
裁切、层级、fit、opacity 与 gain 的手势会立即刷新预览，手势结束后才持久化最终
Composition。

当输入节点尚未提供 duration 时，初始 Clip 使用明确标记的 1 秒占位；Composition 卡片会在后台通过
宿主媒体流的 probe 或浏览器 `loadedmetadata` 获取真实时长后，更新 source binding，
并且只在初始 Clip 仍保持占位长度时扩展它。后续边刷新不得再把已探测时长覆盖回 1 秒。

当前 Convax 尚未提供通用 node-tool Dock ABI，因此 `0.1.5` 使用全屏工具作为明确的
卡片/工具分界。将来若宿主提供对所有 Plugin 都可用的通用底部 Dock，本 Plugin 只需
替换打开容器，不改变 Composition 或预览协议；宿主不得为 `video-timeline` 增加特例。

## 2. 仓库所有权

### `convax-plugins`

`packages/plugins/video-timeline` 拥有：

- Plugin manifest、静态 Web surface 和本地静态资产；
- Timeline UI、Composition schema、schema migration 和编辑命令；
- 连入媒体与 Composition source binding 的确定性协调；
- Plugin 工作区测试和使用说明。

如果后续加入完整渲染、媒体探测或完整 OTIO 转换，需要本地可执行代码时，源码放在
独立的 `packages/tools/video-timeline-renderer` 工作区。它是单独发布、单独验证的
companion，不进入 Plugin ZIP。

### `convax`

宿主仓库只拥有通用能力：

- 从选中媒体物化“贡献该动作的 Plugin 自有节点”并连线；
- 对直接连入媒体签发短生命周期、无原生路径的预览流；
- capability/manifest/protocol 校验、Canvas 原子事务和生命周期撤销；
- ABI、IPC、renderer projection 和安全测试。

宿主实现不得按 `video-timeline` Plugin id 分支。所有行为必须来自经过校验的 manifest
contribution、能力授权和调用上下文。

### 明确禁止

- 不复制 Mediax 的 Electron、Loro、SQLite、Media Core 或私有实现；
- 不在 `convax-plugins` 内创建包特定的宿主桥；
- 不读写私有 `.convax` JSON；
- 不向 iframe 暴露绝对路径、Project 私有路径或无限期资源 URL；
- 不把可执行文件、依赖树、远程脚本或安装脚本放入 Plugin ZIP；
- 不把 OTIO Python/C++ runtime 放入静态 Plugin 包。

## 3. 用户入口

### 3.1 新建空 Timeline

Plugin renderer 声明 `create: true`。用户从 Convax Plugin 创建入口新建节点时：

- 创建空 Composition 和默认 Composition settings；
- 不预造无来源的 V1/A1 轨道；
- 等待视频或音频节点直接连入。

### 3.2 从视频创建 Timeline

视频节点操作菜单提供“创建 Video Timeline”。宿主在一个 Canvas 原子事务中：

- 校验选中节点仍为可用视频节点；
- 创建贡献该 action 的 Plugin 自有节点；
- 使用 renderer 声明的默认尺寸和 Canvas 业务布局放置节点；
- 创建 `selected video -> created timeline` 边；
- 保留原节点；
- 返回新节点 id 和已提交 revision。

Plugin 首次挂载后根据直接输入幂等物化初始 Track/Clip。宿主不理解 Composition。

## 4. 连线和协调规则

`canvas.inputs.list` 返回的直接输入顺序是初始化提示，不是持续覆盖
Composition 的第二事实源。

对每个唯一媒体节点：

- `video`：创建一条视频轨和一个从时间零开始的初始 Clip；
- `audio`：创建一条音频轨和一个从时间零开始的初始 Clip；
- 其他类型：不创建轨道，显示受支持类型诊断；
- 同一节点的重复边：按宿主结果去重，不重复物化；
- 同一素材需要重复使用时，在 Timeline 内复制 Clip，不依赖重复 Canvas 边。

协调必须使用 `canvas.inputs.list` 返回的不透明 `inputKey` 幂等执行：

- 新连接：创建 source binding、Track 和初始 Clip；
- 重复 invalidation：不产生新实体；
- 断开连接：binding 进入 `offline`，保留 Track、Clip 和最后已知描述；
- 同 `inputKey` 重连：恢复原 binding，不创建重复 Track；
- 同 `inputKey` 内容替换：保留剪辑编辑并刷新描述/预览；
- 新素材可用范围变短：标记越界，不静默裁切、移动或删除 Clip；
- Canvas 边顺序变化：不得覆盖用户已经保存的 `trackOrder`。

视频节点内嵌音频在 0.1.0 不自动拆轨，避免隐式产生重复声音。音视频分离应当是后续
显式命令。

## 5. Composition 领域模型

Plugin state 使用严格校验、显式版本的 JSON 投影。推荐形状：

```ts
interface VideoTimelineStateV1 {
  schema: "convax.video-timeline";
  schemaVersion: 1;
  composition: {
    id: string;
    name: string;
    settings: {
      width: number;
      height: number;
      editRate: { numerator: number; denominator: number };
      sampleRate: number;
      channelLayout: "mono" | "stereo";
      background: string;
    };
    trackOrder: string[];
    tracksById: Record<string, TimelineTrackV1>;
    itemsById: Record<string, TimelineItemV1>;
  };
  sourceBindingsByNodeId: Record<string, SourceBindingV1>;
}
```

V1 状态属性名 `sourceBindingsByNodeId` 和 `sourceRef.nodeId` 是已发布的
Composition schema 名称；从 `0.1.5` 起其中保存的是宿主返回的不透明
`inputKey`，不得把它解释为 Canvas node id、路径或跨 Plugin authority。新的 Host
请求只把该值作为 `canvas.inputs.open({ inputKey })` 的参数。

Track 至少保存：

```ts
interface TimelineTrackV1 {
  id: string;
  kind: "video" | "audio";
  name: string;
  enabled: boolean;
  locked: boolean;
  muted: boolean;
  originNodeId?: string;
}
```

Media item 至少保存：

```ts
interface MediaTimelineItemV1 {
  id: string;
  type: "media";
  trackId: string;
  sourceRef: { kind: "canvas-node"; nodeId: string };
  sourceRange: TimeRangeV1;
  timelineRange: TimeRangeV1;
  playbackRate: { numerator: number; denominator: number };
  enabled: boolean;
  name: string;
  fit: "contain" | "cover";
  opacity: number;
  gain: number;
}
```

核心不变量：

- CompositionId、TrackId、TimelineItemId 和 Canvas Node ID 不复用；
- 同一 Canvas 素材允许对应多个拥有独立裁切范围的 Clip；
- Clip 必须区分素材内 `sourceRange` 与成片内 `timelineRange`；
- 同轨 item 按 `timelineRange.start`、再按稳定 id 确定性排序；
- 0.1.0 中同轨媒体 item 不允许重叠；
- 视频轨按照显式 `trackOrder` 合成，音频轨进行混合；
- Composition 中不保存绝对路径、媒体字节、预览 URL、token、波形或缩略图缓存。

## 6. 时间模型

所有时间区间使用 `[start, endExclusive)` 半开区间。持久化时间使用有理数，避免
Renderer 浮点秒和像素进入事实源：

```ts
interface MediaTimeV1 {
  value: string;
  scale: number;
}

interface TimeRangeV1 {
  start: MediaTimeV1;
  duration: MediaTimeV1;
}
```

约束：

- `scale` 是正安全整数；
- `value` 是十进制整数字符串；
- duration 非负，Clip duration 必须为正；
- 所有编辑操作先吸附到 Composition `editRate`，再提交；
- 播放 seek 使用
  `sourceStart + (playhead - timelineStart) * playbackRate`；
- 可用媒体范围、source range 和 timeline range 不得混用。

## 7. 0.1.0 编辑体验

首个可用版本包含：

- Composition monitor 和播放头；
- 播放/暂停；
- 时间标尺、横向滚动和本地缩放；
- 视频/音频轨展示；
- Clip 选择、移动、左右裁切、播放头拆分和删除；
- 轨道启用、锁定、静音和顺序调整；
- 音频 gain、视频 fit/opacity；
- 离线素材、越界 Clip、状态保存失败和不兼容宿主诊断；
- 全屏编辑；
- 关闭、重开、复制 Timeline 节点后的确定性恢复。

拖动过程中只更新 iframe 本地 projection；在手势结束时提交一次原子
`canvas.node.state.replace`。可以有限节流，但必须在 surface 隐藏、卸载和 teardown 前
flush。写入失败进行有限重试，并在 UI 中保留明确的未保存状态。

以下属于 session/UI state，不写入 Composition：播放头、播放状态、当前选择、hover、
缩放、滚动位置、临时媒体 element、波形/缩略图缓存和预览 session。

## 8. 需要新增的通用宿主 ABI

### 8.1 Materialize own Plugin node

现有 `selectionActions` 只能驱动 generation tool，不能创建 Plugin 节点。新增一种声明式
action variant，语义为“从当前合法媒体选择创建贡献者自己的 Plugin 节点并连线”。

建议语义字段：

```json
{
  "id": "create-video-timeline",
  "title": {
    "default": "Create Video Timeline",
    "zh-CN": "创建 Video Timeline"
  },
  "description": {
    "default": "Create an editable timeline from this video without replacing the source.",
    "zh-CN": "从此视频创建可编辑时间线，并保留原素材节点。"
  },
  "target": "video",
  "action": {
    "type": "materialize-own-plugin-node",
    "connect": "selection-to-created"
  }
}
```

字段名称可按现有 schema 风格微调，但必须保持以下安全语义：

- Plugin id 从已校验 manifest principal 推导，贡献内容不能指定任意 Plugin id；
- 只创建本 Plugin renderer 节点；
- 使用 Canvas application service 和一个原子事务；
- 不能删除、替换或修改源媒体内容；
- 不要求 Plugin 获得宽泛 `canvas.document.write`；
- action 不依赖 generation runtime 或 companion。

已经发布的 manifest/protocol 不应被静默拓宽。优先新增兼容的 manifest schema 和独立
协商的 capability protocol revision；如仓库现有兼容策略要求其他版本方式，需要在设计
和测试中明确证明向后兼容。

### 8.2 Connected media preview stream

`canvas.inputs.list` 只返回无路径元数据和不透明 `inputKey`。Timeline monitor
通过已声明的 `canvas.connectedMedia.stream` grant 使用 v8 Catalog API：

```text
canvas.inputs.list()
canvas.inputs.open({ inputKey })
canvas.inputs.close({ sessionId })
```

`open` 返回短生命周期 session、宿主管理的流式媒体 URL 和无路径 probe facts：

- MIME；
- 精确或带 `estimated` 标记的 duration；
- 视频 width/height/frame rate；
- 音频 sample rate/channel count；
- media revision 或其他不泄露路径的内容版本。

安全约束：

- `inputKey` 必须来自当前连接的 `canvas.inputs.list`，对应素材仍是当前 Plugin
  节点的直接输入；
- 只在用户显式播放/打开预览时签发；
- 支持范围读取或等价流式传输，不把整段视频编码成 data URL；
- URL 不包含原生路径且只对当前 frame/session 有效；
- 每次请求重新校验 Project、Canvas、直接边、资源引用和 media revision；
- `canvas.inputs.changed` 触发重新协调；边断开、素材替换、frame 销毁、Plugin
  更新或显式 close 时立即撤销；
- CSP 只为已授权 surface 开放宿主管理的媒体 scheme；
- 不授予上传、任意网络或通用文件读取能力。

## 9. 状态大小和迁移

当前 Plugin node state 默认限制为 256 KiB。0.1.0 必须：

- 每次保存前计算 UTF-8 JSON 字节数；
- 在 240 KiB 留出宿主封装余量并停止危险写入；
- 对用户显示可恢复的容量诊断；
- 不将 undo 历史、缓存或派生数据放入 state；
- 使用纯函数、逐版本 schema migration；
- 未知未来版本只读打开，不能猜测性降级或覆盖为空；
- 校验或迁移失败时保留原始 state，并给出明确诊断。

专业长时间线超出 node state 后，应在 `convax` 设计独立、revision-bound 的 Project
resource capability，不能让 Plugin 自行写 `.convax`，也不能无边界增大 state 上限。

## 10. OTIO 边界

OTIO 是 import/export adapter，不是 Plugin state 的原始序列化格式。

映射：

| OTIO                   | Video Timeline                          |
| ---------------------- | --------------------------------------- |
| Timeline               | Composition                             |
| 顶层 Stack             | `trackOrder` 和 `tracksById`            |
| Track                  | TimelineTrack                           |
| Clip                   | MediaTimelineItem                       |
| Gap                    | 根据显式 `timelineRange` 空洞生成或导入 |
| RationalTime/TimeRange | MediaTime/TimeRange                     |
| ExternalReference      | Canvas source binding 的交换投影        |

导出时按 `trackOrder` 生成 Track，同轨按时间和稳定 id 排序，空洞生成 Gap，
`sourceRange` 输出为 Clip source range。非法重叠必须拒绝，不能静默改时间。无法生成
可移植媒体引用时，输出 MissingReference 和受限 Convax metadata，绝不写入绝对路径。

导入时按顶层 Stack 顺序创建轨道，通过 Track cursor 把 Clip/Gap 转为显式
`timelineRange`。无法解析的媒体引用成为 offline binding。0.1.0 未支持的 Transition、
Nested Composition 和 Time Effect 必须产生明确诊断。

Golden fixtures 至少覆盖：空 Timeline、单视频、多视频轨、音频轨、Gap、裁切、非零
媒体起点、离线引用和规范化 round-trip。

## 11. 里程碑

### M0：宿主通路

- 新的 manifest/action variant 及完整 validator/parser/install/Registry 覆盖；
- 原子 materialize-own-plugin-node Canvas 业务路径；
- connected media preview session、生命周期撤销和安全测试；
- 旧 Plugin schema/protocol 行为不变。

### M1：Plugin 纵向切片

- `video-timeline` Bun workspace、manifest、离线静态 surface 和测试；
- 空 Timeline 创建；
- 视频一键创建 Timeline；
- 视频/音频连线幂等物化轨道；
- node-state schema、migration、容量保护和重启恢复；
- selected Clip source monitor。

### M2：Timeline 编辑

- move/trim/split/remove；
- track lock/mute/order；
- 多轨视频合成预览和音频混合；
- frame snapping、冲突/失败恢复和性能测试。

### M3：交换和交付

- OTIO subset import/export 和 golden fixtures；
- 如产品需要，再增加独立 reviewed render companion；
- 显式 Render/Export，支持取消、失败和 source revision recheck。

## 12. 验收标准

- 空 Timeline 重启后 Composition 完整恢复；
- 从视频创建 Timeline 不删除或修改原视频节点；
- 两个视频和一个音频直接连入后稳定产生两条视频轨和一条音频轨；
- 重复 invalidation、重复挂载和 StrictMode effect 不产生重复实体；
- 断线只离线素材，不删除 Track/Clip；同 node id 重连恢复原 binding；
- 同一素材能生成多个独立 Clip；
- 素材变短时给出越界诊断，不静默改 Composition；
- 持久化时间全部为规范化有理时间；
- state 不含路径、媒体 URL、字节、token 或缓存；
- state 接近限制时安全拒绝并保留最后已提交快照；
- 预览 session 在边、素材、frame 或 Plugin 生命周期变化后失效；
- 不兼容旧宿主显示明确提示，不伪造成功；
- Canvas mutation 走宿主 application service 和 revision/CAS 语义；
- 宿主没有任何按 `video-timeline` id 分支的运行时逻辑；
- OTIO fixtures 达到规范化投影一致；
- Plugin ZIP 不包含 companion、依赖树、远程脚本或原生二进制。

## 13. 验证要求

当前 Plugin 任务不得切换到或修改 Host 仓库。若验证发现现有 Catalog/SDK 缺少通用
能力，只能在本仓按 `convax-plugin-authoring` 模板记录通用 contract requirement，
标记受影响包存在技术 blocker，并停止依赖该能力的实现。独立 Host-owned 任务只实现
通用 contract；新 Catalog 的精确 digest 校验通过并移除 blocker 后会自动恢复发布，
不经过人工审批、receipt 或 Environment。

`convax-plugins` 中按仓库契约运行：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run workspaces:build:packages
bun run validate
bun run workspaces:typecheck
bun run workspaces:test
bun run build:companions
bun test
bun run pack
bun run skill-api:check
bun run marketplace:check
```

检查生成 ZIP 的文件清单，但不要提交 `dist/`、依赖、凭据或本地 Convax 状态。

## 14. 参考基线

- `docs/plugin-authoring.md`
- `packages/skills/convax-plugin-authoring/package/SKILL.md`
- 构建或发布环境提供的 `@convax/plugin-api` Catalog 与
  `@convax/plugin-sdk` reference
- `packages/plugins/chatcut`
- `../../mediax/docs/timeline-opentimelineio.md`
- `../../mediax/docs/canvas-node-domain.md`
- `../../mediax/references/OpenTimelineIO/docs/tutorials/otio-timeline-structure.md`
- `../../mediax/references/OpenTimelineIO/docs/tutorials/time-ranges.md`

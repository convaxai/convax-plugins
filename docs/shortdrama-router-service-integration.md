# `shortdrama-router@0.5.0` 通用媒体路由能力验收

本文仅依据 npm 已发布 tarball 的公共类型、导出与可观察行为验收
`shortdrama-router@0.5.0`。它描述一个通用媒体路由库已经提供什么、仍需哪些通用
发布证据，不假定任何特定下游产品，也不要求各 provider 具备相同功能。

媒体服务不必提供 LLM。聊天、文本补全、SSE 和完整 OpenAI/OpenRouter 协议不属于
本次验收门槛；当前图片接口的 OpenAI 兼容范围只需准确记录即可。

## 1. 发布物身份

以下信息于 2026-08-19 从 npm registry 获取，并对下载 tarball 本地复算：

| 字段 | 验证值 |
| --- | --- |
| package | `shortdrama-router` |
| version / dist-tag | `0.5.0` / `latest` |
| npm integrity | `sha512-iFPlCzXC3l2KUtTTS0ZP7ft9urwR9bUjv+QP2W/bwyJAPx9hWLdRRe7CT41b8GyzgqveN4VfXiJNaovj7u8wgA==` |
| npm shasum | `915f596a0b5dab1510e0bc850bacf66967782871` |
| git head | `96b39e300d4e50660188565db0b77d03f1f98a1f` |
| published | `2026-08-19T06:44:36.634Z` |
| archive | 45 files，84.6 kB packed，438.9 kB unpacked |
| runtime | ESM，Node.js `>=22.0.0` |
| npm provenance | GitHub Actions OIDC，SLSA provenance attestation |

复现命令：

```sh
npm view shortdrama-router@0.5.0 version dist.integrity dist.shasum dist.tarball dist.attestations gitHead time engines --json
npm pack shortdrama-router@0.5.0
shasum -a 1 shortdrama-router-0.5.0.tgz
openssl dgst -sha512 -binary shortdrama-router-0.5.0.tgz | openssl base64 -A
```

发布物是无运行时 npm 依赖的 bundle。Jimeng 与 LibTV adapter 仍会启动 npm 包之外
的本地 CLI；0.5.0 内部下载和管理这些 CLI 的 runtime service，但 provider CLI 字节
仍不在 npm tarball 内，因此 npm tarball 本身不是完整可执行闭包。

## 2. 0.5.0 已验收的通用契约

### 2.1 Managed runtime

公共 API 新增平台识别、受管理路径、安装与状态接口：

- `detectRuntimePlatform()` 覆盖 macOS、Linux、Windows 的 x64/arm64 组合；
- `createBuiltInRuntimeService()`、`installJimengRuntime()` 和
  `installLibTvRuntime()` 提供显式安装入口；
- CLI 与本地 HTTP `POST /api/v1/providers/{provider}/runtime` 可触发同一安装操作；
- 安装先写临时目录、执行版本 probe，再原子替换现有 runtime；版本无法识别或
  不兼容时状态为 `invalid`，不会被报告为可用。

`createShortDramaRouter({ runtimeRootDir })` 会把同一 runtime root 传给内建 Provider；
`startRouterServer({ runtimeRootDir })` 同时把它传给 runtime installer 和 Provider。
普通业务只调用 Provider/runtime 安装、状态、授权和生成 API，不读取或拼接 CLI
路径。默认运行不再读取 PATH、`~/.local/bin/dreamina` 或 `~/.libtv/libtv`；显式
`cliPath` 只保留为开发调试覆盖项。

GitHub Release `v0.5.0` 另提供内置 Node.js 的 `darwin-arm64`、`linux-x64` 和
`win32-x64` standalone 制品，GitHub API 为三个 release asset 分别记录 SHA-256。
这解决 router 自身无需 npm/Node.js 的分发问题；它不等同于 installer 后续下载的
Dreamina/LibTV provider CLI 字节完整性。

### 2.2 分方式鉴权

公共类型现在提供：

- 每种鉴权方式的 `managed` / `external` 管理模式；
- 每种方式支持的 `status`、`begin`、`complete`、`cancel`、`clear` 动作集合；
- 逐方式状态、聚合生效方式、稳定 `reason_code` 和 `verified_at`；
- 按方式清理和通用清理入口。

小云雀的 `api_key` 与 `browser_session` 能独立表示；Jimeng 为 managed OAuth；
LibTV 明确声明 external OAuth，仅支持 status 与 clear。调用方可以据此只暴露真实
动作，不再通过异常文案猜测能力。

### 2.3 Provider 配置与资源

公共 API 已提供配置状态、资源发现、配置选择与清除：

- `getProviderConfiguration()`；
- `listProviderResources()`；
- `configureProvider()`；
- `clearProviderConfiguration()`；
- 可注入的 `LibTvConfigurationSource`。

LibTV 项目现在是类型化资源，能区分 required、configured、valid、unavailable 和
error。选择会先验证账号可见性，模型可用性也会反映配置状态。

### 2.4 模型约束和当前可用性

`ProviderModel` 现在包含：

- `availability.state`、`reason_code`、`observed_at`；
- 参数的 enum、range、unknown、unsupported 约束；
- 引用能力、输出 MIME 集合和 provider options schema；
- 由鉴权、配置和外部依赖共同计算的当前可用性。

小云雀视频时长已公开为 `min: 1`、`max: 60`、`step: 1`，不再需要解释
`durations: null`。图片模型的鉴权 metadata 也已补齐。动态 provider 的模型参数可以
由调用方统一投影，并在提交前按所选模型再次校验。

### 2.5 Durable job、幂等与恢复

0.5.0 保留完成 crash-safe 适配所需的公开原语：

- create 请求接受 `idempotency_key`，HTTP 接受 `Idempotency-Key`；
- JobStore 支持 `claim`、`compareAndSet`、`getByIdempotencyKey`；
- 请求会生成稳定 fingerprint，同 key 不同输入返回 conflict；
- provider submit 前先原子 claim `submitting` 记录；
- provider 是否接受无法确认时落为 `submission_unknown`，明确禁止自动重提；
- 已持久化 provider reference 的任务可在重启后继续 poll；
- 状态转换由 `assertStatusTransition` 统一约束。

默认 Memory store 仍适合开发；生产调用方可以通过公开注入点提供数据库或其他
durable store。该设计正确地区分了“确认失败”和“是否接受未知”，避免为恢复而重复
付费提交。

### 2.6 Artifact、错误与能力降级

成功任务提供规范化 `MediaArtifact`，包含 kind、canonical MIME、URL 以及可选大小、
过期时间和临时标记。模型目录声明输出 MIME；旧 outputs 仍可兼容读取。

错误已按 invalid request、unsupported、authorization、configuration、model
unavailable、rate limit、provider failure、timeout、cancelled、conflict 和 internal
分类，并公开 retryable 语义。

ingestion 和 cancellation 都是可发现的 provider 能力。当前三家 provider 对这两项
均明确返回空能力集合；这是受支持的正常差异。调用方应隐藏引用输入和取消操作，
而不是模拟成功或把“不支持”当成实现缺陷。

## 3. 原清单验收结果

| 项目 | 0.5.0 结果 | 结论 |
| --- | --- | --- |
| R1 分方式鉴权 | 管理模式、动作集合、逐方式状态和稳定原因均已公开 | 已解决 |
| R2 私有配置与资源 | 发现、验证、选择、清除和可注入配置源均已公开 | 已解决 |
| R3 外部 CLI 依赖 | 新增 managed installer、平台识别、绝对路径、版本 probe 和 standalone 发布物；provider CLI 下载仍无不可变摘要或签名 | 部分解决 |
| R4 模型目录 | 约束、引用、MIME、可用性和 provider options 均已规范化 | 已解决 |
| R5 素材 ingestion | 能力与 API 已公开；当前三家明确不支持 | 契约已解决，provider 能力按实际降级 |
| R6 durable job | 幂等 claim、CAS、恢复、submission unknown 和取消 API 均已公开；并发 submitting 观察仍有竞态 | 部分解决 |
| R7 artifact schema | canonical artifact 与模型输出 MIME 已公开 | 已解决 |
| R8 错误/超时/秘密边界 | 稳定分类、retryable 与 AbortSignal 路径已公开 | 已解决 |

## 4. 仍需补齐的通用发布证据

### 4.1 Managed CLI 字节完整性

0.5.0 已解决业务层 CLI 路径感知、旧路径回退、安装位置、平台识别和版本不可识别时
fail closed；npm 包自身也通过 GitHub Actions OIDC 发布并带 SLSA provenance。但
`ProviderRuntimeArtifact` 只有 URL、archive 类型、文件名和大小上限，没有摘要或
签名字段。安装器跟随重定向、下载字节并在执行版本 probe 后发布：

- Jimeng 先读取远程 `version.json`，再从不含版本的固定 artifact URL 下载；其 probe
  接受任意可识别版本，并未把 CLI 报告版本与 release version 做相等校验；
- LibTV 使用固定 `1.0.2` URL 并严格比较报告版本，但下载字节仍没有 SHA-256 或签名
  验证。

版本 probe 只能证明“字节可执行并打印了某个版本”，不能证明字节来自预期发布物。
因此自动下载安装与可验证供应链仍是两个不同层次。

建议后续提供：

1. `ProviderRuntimeArtifact` 增加每个精确平台制品的 SHA-256 或可验证签名；
2. 下载完成、解压和执行前验证完整字节，重定向后的最终来源也必须满足发布策略；
3. Jimeng 把 CLI 报告版本与版本 discovery 的 release version 绑定；
4. 发布清单记录官方来源、许可/再分发条件、精确版本和各平台摘要；
5. clean-profile 测试覆盖安装、篡改拒绝、登录、模型 discovery、submit 与 logout。

这是当前仍然影响“可验证完整运行闭包”的通用契约缺口。

### 4.2 并发 submitting claim 的所有权

0.5.0 的原子 claim 能保证同一幂等键只调用一次 provider submit，但当前仍有一个可
复现的观察竞态：

1. 调用 A claim 成功，记录为 `submitting`，并等待 provider 返回 reference；
2. 并发调用 B 使用相同 key，得到同一 `submitting` job；
3. B 立即调用 `getImage/getAudio/getVideo`；
4. 因记录暂时没有 reference，get 把它 CAS 为 `submission_unknown`；
5. A 随后拿到真实 reference，但 CAS 已失败，最终也只能返回
   `submission_unknown`。

该过程不会产生第二次付费 submit，但会在原提交仍正常执行时过早丢失可恢复的
provider reference。通用修复应由 router/store 契约表达 claim owner、lease 或等待
语义：非 owner 观察到 fresh `submitting` 时必须等待 owner 发布 reference；只有
owner 崩溃或租约确定过期后才可转为 `submission_unknown`。

建议增加两个并发验收：

- 两个独立 router/store 实例同时使用相同 key，provider submit 恰好一次，两个调用
  最终得到同一可查询 job 和 reference；
- claim owner 在 provider 接受前后分别崩溃，等待者不会重提，并只在可证明 owner
  已失效后进入 `submission_unknown`。

### 4.3 真实账号与动态 CLI 样本

tarball 可证明 API 和模拟行为，不能证明真实账号、会员计划、额度或当前 CLI 输出。
建议每次发布附带脱敏、可复现的真实 smoke 记录：

- managed 鉴权或 external credential probe；
- 配置资源 discovery 与选择；
- 当前模型目录；
- 每个声明支持的 media kind 至少一次最小生成；
- 重启后继续查询同一 provider job；
- 输出 MIME 与容器样本校验；
- clear/logout（仅在该动作受支持时）。

### 4.4 External authorization 的可操作入口

LibTV 仍把 OAuth 声明为 external，公开动作只有 status 与 clear。安装 runtime 后，
调用方仍需在同一配置目录中另行运行官方 CLI 登录；router 的 JavaScript 和 HTTP
Provider API 没有 begin/complete 或 launch-login 操作。对仅提供 API/UI、没有交互式
终端的通用接入方，这意味着“可安装”尚不等于“可完成首次授权”。

若目标是完整 managed setup，建议为 external CLI authorization 提供一种公开、可
取消且可探测的启动契约，例如启动官方 device/web login 并返回登录 URL/状态；若
Provider 明确只支持人工终端登录，则应继续保持 external，并让调用方隐藏无法完成的
授权动作。

## 5. 协议范围说明

当前包是媒体任务 router，不是通用 LLM router。它可以保留：

- provider-prefixed model id；
- 异步 audio/image/video job API；
- OpenAI-compatible image generation endpoint。

它不必为了满足本清单实现 `/v1/chat/completions`、聊天 SSE、统一 LLM
`/v1/models` 或文本 token stream。只需在 README 和发布说明中继续准确描述兼容
范围，避免“OpenAI-compatible image”被误读为完整 OpenAI/OpenRouter 协议。

## 6. 结论

`shortdrama-router@0.5.0` 已提供通用适配层安全抹平 provider 差异所需的主要公开
契约。调用方现在可以根据 capability、逐方式鉴权、配置状态、模型可用性和稳定错误
统一隐藏不支持的功能，并通过 durable JobStore 实现不重复提交的恢复。

剩余工作集中在 managed CLI 下载字节的可验证供应链、LibTV external login 的可操作
入口、并发 submitting claim 的所有权语义和真实账号发布证据，不需要为任何特定
下游增加专有字段，也不需要把 LLM、素材 ingestion 或 provider cancellation 变成
所有媒体服务的强制能力。

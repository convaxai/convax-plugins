# 剪映导入 for Convax

该插件将直接连接到插件节点的 Canvas 图片和视频导入本机剪映。它不会随
Convax 默认安装；用户需要从 Convax Plugin Registry 主动安装。

插件 iframe 只能看到宿主提供的项目、画布和直接入边投影，不能读取原生
路径或文件字节。点击导入后，Convax 才会把仍然有效的直接连接素材暂存为
短期副本，并把副本交给 Registry 校验过的 `convax-jianying-editor-mcp`
companion。companion 负责 macOS 剪映进程/草稿识别、Deep Link 分发和
loopback 文件传输，不包含 Canvas、Project、IPC 或 Convax Desktop 逻辑。

Agent 工作流由插件拥有的 `jianying-editor` Skill 约束：先检查草稿，当前
草稿存在时必须让用户选择；新草稿只能从安全确认的无活动草稿状态创建。
不确定或部分传输结果不会自动重试，以免重复导入。

安装并完成 companion 设置后，普通 Canvas 图片和视频节点的工具栏会显示
“导入剪映”。该动作只接受当前单选节点，由宿主暂存并立即复核素材；稳定的
当前草稿会直接复用，没有活动草稿时安全创建新草稿，歧义或变化状态则停止。

该能力要求 Convax 与剪映专业版运行在同一台 Mac 上。若剪映未安装、草稿
状态不稳定、暂存素材已失效或 Deep Link/loopback 传输未完成，companion 会
返回具体原因和下一步处理建议；传输结果不确定时应先检查草稿，只重试缺失
素材，避免重复导入。

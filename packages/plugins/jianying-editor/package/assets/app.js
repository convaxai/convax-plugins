import { acceptPluginHostConnection } from "./plugin-host-client.js"

(() => {
  "use strict"

  const INPUTS_CHANGED_COMMAND = "canvas.inputs.changed"
  const elements = {
    connection: document.getElementById("connection"),
    count: document.getElementById("count"),
    empty: document.getElementById("empty"),
    export: document.getElementById("export"),
    inputs: document.getElementById("inputs"),
    inspect: document.getElementById("inspect"),
    result: document.getElementById("result"),
    scope: document.getElementById("scope"),
  }
  let inputs = []
  let hostClient = null
  let busy = false

  function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  function request(method, params) {
    if (!hostClient) return Promise.reject(new Error("Convax host is not connected"))
    return hostClient.callHostApi(method, params)
  }

  function receiveCommand(message) {
    if (message.command === INPUTS_CHANGED_COMMAND) {
      void loadInputs()
    }
  }

  function normalizeInput(value) {
    if (!object(value)) return null
    const inputKey = value.inputKey
    const kind = typeof value.kind === "string" ? value.kind.toLowerCase() : ""
    if (typeof inputKey !== "string" || !["image", "video"].includes(kind)) return null
    return {
      inputKey,
      kind,
      name:
        typeof value.name === "string"
          ? value.name
          : typeof value.label === "string"
            ? value.label
            : inputKey,
      role: kind === "image" ? "reference_image" : "reference_video",
    }
  }

  function render() {
    elements.count.textContent = String(inputs.length)
    elements.empty.hidden = inputs.length > 0
    elements.inputs.replaceChildren(...inputs.map((input) => {
      const item = document.createElement("li")
      const name = document.createElement("span")
      const kind = document.createElement("span")
      name.textContent = input.name
      kind.textContent = input.kind === "image" ? "图片" : "视频"
      item.append(name, kind)
      return item
    }))
    elements.inspect.disabled = !hostClient || busy
    elements.export.disabled = !hostClient || busy || inputs.length === 0
  }

  async function loadInputs() {
    const result = await request("canvas.inputs.list")
    const values = object(result) && Array.isArray(result.inputs) ? result.inputs : Array.isArray(result) ? result : []
    inputs = values.map(normalizeInput).filter(Boolean)
    render()
  }

  async function execute(toolId, references = []) {
    const result = await request("generation.execute", {
      output: "text",
      prompt: toolId === "draft.status" ? "Inspect JianYing draft state" : "Import connected Canvas media into JianYing",
      references,
      resultMode: "return",
      toolId,
    })
    if (!object(result) || typeof result.outputText !== "string") {
      throw new Error("剪映工具没有返回有效结果")
    }
    return result.outputText
  }

  async function run(action) {
    busy = true
    render()
    elements.result.textContent = action === "inspect" ? "正在检查剪映…" : "正在交给剪映读取素材…"
    try {
      elements.result.textContent = action === "inspect"
        ? await execute("draft.status")
        : await execute("media.export", inputs.map((input) => ({
            inputKey: input.inputKey,
            role: input.role,
          })))
    } catch (error) {
      elements.result.textContent = error instanceof Error ? error.message : String(error)
    } finally {
      busy = false
      render()
    }
  }

  async function initialize() {
    const context = await request("host.context.get")
    if (!object(context) || !object(context.project) || !object(context.canvas)) {
      throw new Error("Convax returned an invalid Canvas context")
    }
    elements.scope.textContent = `${context.project.name ?? context.project.id} / ${context.canvas.name ?? context.canvas.id}`
    elements.connection.textContent = "已连接"
    await loadInputs()
  }

  elements.inspect.addEventListener("click", () => void run("inspect"))
  elements.export.addEventListener("click", () => void run("export"))
  window.addEventListener("message", (event) => {
    if (hostClient) return
    const client = acceptPluginHostConnection(event, {
      onFatalError: (error) => {
        hostClient = null
        elements.connection.textContent = "连接失败"
        elements.result.textContent = error.message
        render()
      },
      requestIdPrefix: "jianying-editor",
    })
    if (!client) return
    hostClient = client
    hostClient.onCommand(receiveCommand)
    void initialize().catch((error) => {
      elements.connection.textContent = "连接失败"
      elements.result.textContent = error instanceof Error ? error.message : String(error)
      render()
    })
  })
  window.addEventListener("pagehide", () => {
    hostClient?.close()
    hostClient = null
  }, { once: true })
})()

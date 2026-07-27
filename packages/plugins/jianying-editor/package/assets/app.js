(() => {
  "use strict"

  const PROTOCOL = "convax.plugin-capability/1"
  const PLUGIN_ID = "jianying-editor"
  const pending = new Map()
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
  let port = null
  let sequence = 0
  let busy = false

  function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  function request(method, params) {
    if (!port) return Promise.reject(new Error("Convax host is not connected"))
    const id = `${PLUGIN_ID}-${++sequence}`
    return new Promise((resolve, reject) => {
      pending.set(id, { reject, resolve })
      port.postMessage({
        id,
        method,
        ...(params === undefined ? {} : { params }),
        protocol: PROTOCOL,
        type: "request",
      })
    })
  }

  function receive(event) {
    const message = event.data
    if (!object(message) || message.protocol !== PROTOCOL) return
    if (message.type === "event" && message.event === "canvas.connectedInputs.changed") {
      void loadInputs()
      return
    }
    if (message.type !== "response" || typeof message.id !== "string") return
    const operation = pending.get(message.id)
    if (!operation) return
    pending.delete(message.id)
    if (message.ok === true) operation.resolve(message.result)
    else operation.reject(new Error(typeof message.error === "string" ? message.error : "Host request failed"))
  }

  function normalizeInput(value) {
    if (!object(value)) return null
    const id = typeof value.id === "string" ? value.id : value.nodeId
    const kind = typeof value.kind === "string" ? value.kind.toLowerCase() : ""
    if (typeof id !== "string" || !["image", "video"].includes(kind)) return null
    return {
      id,
      kind,
      name: typeof value.name === "string" ? value.name : typeof value.label === "string" ? value.label : id,
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
    elements.inspect.disabled = !port || busy
    elements.export.disabled = !port || busy || inputs.length === 0
  }

  async function loadInputs() {
    const result = await request("canvas.connectedInputs.list")
    const values = object(result) && Array.isArray(result.inputs) ? result.inputs : Array.isArray(result) ? result : []
    inputs = values.map(normalizeInput).filter(Boolean)
    render()
  }

  async function execute(toolId, references = []) {
    const result = await request("generation.canvas.execute", {
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
        : await execute("media.export", inputs.map((input) => ({ nodeId: input.id, role: input.role })))
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
    if (event.source !== window.parent || event.ports.length !== 1 || port) return
    port = event.ports[0]
    port.addEventListener("message", receive)
    port.start()
    void initialize().catch((error) => {
      elements.connection.textContent = "连接失败"
      elements.result.textContent = error instanceof Error ? error.message : String(error)
      render()
    })
  })
})()

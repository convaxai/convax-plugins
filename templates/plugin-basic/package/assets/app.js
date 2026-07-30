import { acceptPluginHostConnection } from "./plugin-host-client.js"

const REFRESH_CONTEXT_MESSAGE = "renderer.context.refresh"
const REQUEST_TIMEOUT_MS = 15_000

const status = document.getElementById("status")
const context = document.getElementById("context")
let hostClient

async function request(method) {
  if (!hostClient) throw new Error("Convax Host is not connected")
  const controller = new AbortController()
  const timeout = window.setTimeout(() => {
    controller.abort(new Error(`Convax Host request timed out: ${method}`))
  }, REQUEST_TIMEOUT_MS)
  try {
    return await hostClient.callHostApi(method, undefined, {
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

async function refreshContext() {
  status.textContent = "Reading the active scoped context…"
  try {
    const result = await request("host.context.get")
    context.textContent = JSON.stringify(result, null, 2)
    status.textContent = "Connected through @convax/plugin-sdk client ABI (convax.plugin-host/8)."
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error)
  }
}

function receiveHostCommand(message) {
  if (message.command === REFRESH_CONTEXT_MESSAGE) {
    void refreshContext()
  }
}

function connect(event) {
  if (hostClient) return
  const client = acceptPluginHostConnection(event, {
    onFatalError: (error) => {
      hostClient = undefined
      status.textContent = error.message
    },
    requestIdPrefix: "template",
  })
  if (!client) return
  window.removeEventListener("message", connect)
  hostClient = client
  hostClient.onCommand(receiveHostCommand)
  void refreshContext()
}

window.addEventListener("message", connect)
window.addEventListener("pagehide", () => {
  hostClient?.close()
  hostClient = undefined
}, { once: true })

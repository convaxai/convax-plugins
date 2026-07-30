import { acceptPluginHostConnection } from "./plugin-host-client.js"

(() => {
  "use strict"

  const REFRESH_CONTEXT_MESSAGE = "renderer.context.refresh"
  const status = document.getElementById("status")
  const context = document.getElementById("context")
  const refreshButton = document.getElementById("refresh")
  let hostClient = null

  function request(method, params) {
    if (!hostClient) return Promise.reject(new Error("Convax host is not connected"))
    return hostClient.callHostApi(method, params)
  }

  async function refresh() {
    status.textContent = "Reading the active scoped context…"
    try {
      const result = await request("host.context.get")
      context.textContent = JSON.stringify(result, null, 2)
      status.textContent = "Connected through @convax/plugin-sdk client ABI (convax.plugin-host/8)."
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  function connect(event) {
    if (hostClient) return
    const client = acceptPluginHostConnection(event, {
      onFatalError: (error) => {
        hostClient = null
        refreshButton.disabled = true
        status.textContent = error.message
      },
      requestIdPrefix: "hello",
    })
    if (!client) return
    window.removeEventListener("message", connect)
    hostClient = client
    hostClient.onCommand((command) => {
      if (command.command === REFRESH_CONTEXT_MESSAGE) {
        void refresh()
      }
    })
    refreshButton.disabled = false
    void refresh()
  }

  refreshButton.addEventListener("click", () => void refresh())
  window.addEventListener("message", connect)
  window.addEventListener("pagehide", () => {
    hostClient?.close()
    hostClient = null
  }, { once: true })
})()

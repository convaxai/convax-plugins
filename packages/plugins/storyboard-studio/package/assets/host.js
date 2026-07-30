import { acceptPluginHostConnection } from "./plugin-host-client.js"

export const PROTOCOL = "convax.plugin-host/8"
export const PLUGIN_ID = "storyboard-studio"

function errorMessage(value) {
  return value instanceof Error ? value.message : String(value)
}

export class StoryboardHost {
  #client = null
  #commands = new Set()
  #connectedResolve
  #connectedReject
  #unsubscribeCommands = null

  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.connected = new Promise((resolve, reject) => {
      this.#connectedResolve = resolve
      this.#connectedReject = reject
    })
  }

  acceptConnect(event) {
    if (this.#client) return false
    const client = acceptPluginHostConnection(event, {
      onFatalError: (error) => this.close(error),
      requestIdPrefix: "storyboard",
    })
    if (!client) return false

    this.#client = client
    this.#unsubscribeCommands = client.onCommand(({ command, params }) => {
      for (const listener of this.#commands) listener(command, params)
    })
    this.#connectedResolve(this)
    return true
  }

  onCommand(listener) {
    this.#commands.add(listener)
    return () => this.#commands.delete(listener)
  }

  async request(method, params, options = {}) {
    await this.connected
    if (!this.#client) throw new Error("Convax host is not connected")
    const timeoutMs = options.timeoutMs === undefined ? this.timeoutMs : options.timeoutMs
    const controller =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? new AbortController() : null
    const timeout =
      controller === null
        ? null
        : window.setTimeout(
            () => controller.abort(new Error(`Host request timed out: ${method}`)),
            timeoutMs,
          )
    try {
      const callOptions = controller === null ? {} : { signal: controller.signal }
      return params === undefined
        ? await this.#client.callHostApi(method, callOptions)
        : await this.#client.callHostApi(method, params, callOptions)
    } finally {
      if (timeout !== null) window.clearTimeout(timeout)
    }
  }

  close(reason = new Error("Convax host connection closed")) {
    const error = reason instanceof Error ? reason : new Error(errorMessage(reason))
    this.#connectedReject?.(error)
    this.#unsubscribeCommands?.()
    this.#unsubscribeCommands = null
    this.#commands.clear()
    const client = this.#client
    this.#client = null
    if (client && !client.closed) client.close()
  }
}

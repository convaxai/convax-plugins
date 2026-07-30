export const PROTOCOL = "convax.plugin-capability/1"
export const PLUGIN_ID = "storyboard-studio"

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function errorMessage(value) {
  return value instanceof Error ? value.message : String(value)
}

export class StoryboardHost {
  #port = null
  #sequence = 0
  #pending = new Map()
  #commands = new Set()
  #connectedResolve
  #connectedReject

  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.connected = new Promise((resolve, reject) => {
      this.#connectedResolve = resolve
      this.#connectedReject = reject
    })
  }

  acceptConnect(event) {
    const message = event?.data
    if (
      event?.source !== window.parent ||
      !isRecord(message) ||
      message.protocol !== PROTOCOL ||
      message.type !== "connect" ||
      message.pluginId !== PLUGIN_ID ||
      event.ports?.length !== 1 ||
      this.#port
    ) {
      return false
    }

    this.#port = event.ports[0]
    this.#port.onmessage = (next) => this.#receive(next.data)
    this.#port.onmessageerror = () => this.close(new Error("Convax capability port was interrupted"))
    this.#port.start()
    this.#connectedResolve(this)
    return true
  }

  onCommand(listener) {
    this.#commands.add(listener)
    return () => this.#commands.delete(listener)
  }

  async request(method, params, options = {}) {
    await this.connected
    if (!this.#port) throw new Error("Convax host is not connected")
    const id = `storyboard-${++this.#sequence}`
    const timeoutMs = options.timeoutMs === undefined ? this.timeoutMs : options.timeoutMs

    return new Promise((resolve, reject) => {
      let timeout
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeout = window.setTimeout(() => {
          this.#pending.delete(id)
          reject(new Error(`Host request timed out: ${method}`))
        }, timeoutMs)
      }
      this.#pending.set(id, { reject, resolve, timeout })
      try {
        this.#port.postMessage({
          id,
          method,
          ...(params === undefined ? {} : { params }),
          protocol: PROTOCOL,
          type: "request",
        })
      } catch (error) {
        if (timeout !== undefined) window.clearTimeout(timeout)
        this.#pending.delete(id)
        reject(error)
      }
    })
  }

  close(reason = new Error("Convax host connection closed")) {
    const error = reason instanceof Error ? reason : new Error(errorMessage(reason))
    this.#connectedReject?.(error)
    for (const operation of this.#pending.values()) {
      if (operation.timeout !== undefined) window.clearTimeout(operation.timeout)
      operation.reject(error)
    }
    this.#pending.clear()
    this.#port?.close()
    this.#port = null
  }

  #receive(value) {
    if (!isRecord(value) || value.protocol !== PROTOCOL) return
    if (value.type === "command" && typeof value.command === "string") {
      for (const listener of this.#commands) listener(value.command, value.params)
      return
    }
    if (
      value.type !== "response" ||
      typeof value.id !== "string" ||
      typeof value.ok !== "boolean"
    ) {
      return
    }
    const operation = this.#pending.get(value.id)
    if (!operation) return
    this.#pending.delete(value.id)
    if (operation.timeout !== undefined) window.clearTimeout(operation.timeout)
    if (value.ok) operation.resolve(value.result)
    else operation.reject(new Error(typeof value.error === "string" ? value.error : "Host request failed"))
  }
}

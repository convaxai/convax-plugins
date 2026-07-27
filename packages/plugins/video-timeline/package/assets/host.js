export const PROTOCOL = "convax.plugin-capability/2"
export const PLUGIN_ID = "video-timeline"

function isResponse(value) {
  return value && value.protocol === PROTOCOL && value.type === "response" && typeof value.id === "string" && typeof value.ok === "boolean"
}

export class TimelineHostClient {
  #port = null
  #counter = 0
  #pending = new Map()
  #commands = new Set()
  #connectedResolve
  #connectedReject

  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 15000
    this.connected = new Promise((resolve, reject) => {
      this.#connectedResolve = resolve
      this.#connectedReject = reject
    })
  }

  acceptConnect(event) {
    const message = event?.data
    if (event?.source !== window.parent || message?.protocol !== PROTOCOL || message?.type !== "connect" || message?.pluginId !== PLUGIN_ID || event.ports?.length !== 1 || this.#port) return false
    this.#port = event.ports[0]
    this.#port.onmessage = (next) => this.#receive(next.data)
    this.#port.start()
    this.#connectedResolve(this)
    return true
  }

  onCommand(listener) {
    this.#commands.add(listener)
    return () => this.#commands.delete(listener)
  }

  async request(method, params) {
    await this.connected
    const id = `timeline-${++this.#counter}`
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Host request timed out: ${method}`))
      }, this.timeoutMs)
      this.#pending.set(id, { resolve, reject, timeout })
      try {
        this.#port.postMessage({ id, method, ...(params === undefined ? {} : { params }), protocol: PROTOCOL, type: "request" })
      } catch (error) {
        window.clearTimeout(timeout)
        this.#pending.delete(id)
        reject(error)
      }
    })
  }

  close() {
    this.#connectedReject?.(new Error("Host connection closed"))
    for (const pending of this.#pending.values()) {
      window.clearTimeout(pending.timeout)
      pending.reject(new Error("Host connection closed"))
    }
    this.#pending.clear()
    this.#port?.close()
    this.#port = null
  }

  #receive(value) {
    if (value?.protocol === PROTOCOL && value?.type === "command" && typeof value.command === "string") {
      for (const listener of this.#commands) listener(value.command, value.params)
      return
    }
    if (!isResponse(value)) return
    const pending = this.#pending.get(value.id)
    if (!pending) return
    this.#pending.delete(value.id)
    window.clearTimeout(pending.timeout)
    if (value.ok) pending.resolve(value.result)
    else pending.reject(new Error(value.error || "Host request failed"))
  }
}

export class TimelineSaveController {
  #generation = 0
  #timer = null
  #saving = false

  constructor(save, options = {}) {
    this.save = save
    this.delayMs = options.delayMs ?? 220
    this.maximumAttempts = options.maximumAttempts ?? 3
    this.onStatus = options.onStatus ?? (() => undefined)
    this.pending = null
    this.persisted = ""
    this.failed = null
  }

  hydrate(state) {
    this.pending = null
    this.persisted = JSON.stringify(state)
    this.failed = null
    this.onStatus("saved")
  }

  mark(state) {
    this.pending = structuredClone(state)
    this.#generation += 1
    this.failed = null
    this.onStatus("unsaved")
    if (this.#timer !== null) window.clearTimeout(this.#timer)
    this.#timer = window.setTimeout(() => {
      this.#timer = null
      void this.flush()
    }, this.delayMs)
  }

  async flush() {
    if (this.#saving || !this.pending) return false
    if (this.#timer !== null) window.clearTimeout(this.#timer)
    this.#timer = null
    const generation = this.#generation
    const snapshot = structuredClone(this.pending)
    this.#saving = true
    this.onStatus("saving")
    let lastError
    try {
      for (let attempt = 0; attempt < this.maximumAttempts; attempt += 1) {
        try {
          await this.save(snapshot)
          if (generation === this.#generation) {
            this.persisted = JSON.stringify(snapshot)
            this.pending = null
            this.failed = null
            this.onStatus("saved")
          }
          return true
        } catch (error) {
          lastError = error
          if (attempt + 1 < this.maximumAttempts) await new Promise((resolve) => window.setTimeout(resolve, 150 * 2 ** attempt))
        }
      }
      if (generation === this.#generation) {
        this.failed = lastError
        this.onStatus("failed", lastError)
      }
      return false
    } finally {
      this.#saving = false
      if (this.pending && generation !== this.#generation) void this.flush()
    }
  }
}

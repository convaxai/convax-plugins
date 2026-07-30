import { acceptPluginHostConnection } from "./plugin-host-client.js"

export class TimelineHostClient {
  #client = null
  #commands = new Set()
  #connectedResolve
  #connectedReject
  #unsubscribeCommand

  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 15000
    this.connected = new Promise((resolve, reject) => {
      this.#connectedResolve = resolve
      this.#connectedReject = reject
    })
  }

  acceptConnect(event) {
    if (this.#client) return false
    const client = acceptPluginHostConnection(event, {
      onFatalError: (error) => this.#disconnect(error),
      requestIdPrefix: "timeline",
    })
    if (!client) return false
    this.#client = client
    this.#unsubscribeCommand = client.onCommand((command) => {
      for (const listener of this.#commands) {
        listener(command.command, command.params)
      }
    })
    this.#connectedResolve(this)
    return true
  }

  onCommand(listener) {
    this.#commands.add(listener)
    return () => this.#commands.delete(listener)
  }

  async request(method, params) {
    await this.connected
    if (!this.#client) throw new Error("Host connection closed")
    const controller = new AbortController()
    const timeout = window.setTimeout(
      () => controller.abort(new Error(`Host request timed out: ${method}`)),
      this.timeoutMs,
    )
    try {
      return await this.#client.callHostApi(method, params, {
        signal: controller.signal,
      })
    } finally {
      window.clearTimeout(timeout)
    }
  }

  close() {
    this.#disconnect(new Error("Host connection closed"))
  }

  #disconnect(error) {
    this.#connectedReject?.(error)
    this.#connectedReject = undefined
    this.#unsubscribeCommand?.()
    this.#unsubscribeCommand = undefined
    this.#client?.close()
    this.#client = null
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

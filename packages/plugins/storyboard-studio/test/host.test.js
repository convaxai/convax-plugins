import { describe, expect, test } from "bun:test"

import { PLUGIN_ID, PROTOCOL, StoryboardHost } from "../package/assets/host.js"

class FakePort {
  constructor() {
    this.closed = 0
    this.listeners = new Set()
    this.messages = []
    this.started = 0
  }

  addEventListener(type, listener) {
    if (type === "message") this.listeners.add(listener)
  }

  removeEventListener(type, listener) {
    if (type === "message") this.listeners.delete(listener)
  }

  start() {
    this.started += 1
  }

  postMessage(message) {
    this.messages.push(structuredClone(message))
  }

  close() {
    this.closed += 1
  }

  receive(message) {
    for (const listener of this.listeners) listener({ data: message })
  }
}

async function withFakeWindow(run) {
  const previous = globalThis.window
  const parent = { name: "convax-parent" }
  globalThis.window = { parent, setTimeout, clearTimeout }
  try {
    return await run(parent)
  } finally {
    globalThis.window = previous
  }
}

function connectEvent(parent, port, overrides = {}) {
  return {
    source: parent,
    ports: [port],
    data: {
      protocol: PROTOCOL,
      type: "connect",
      pluginId: PLUGIN_ID,
    },
    ...overrides,
  }
}

describe("StoryboardHost SDK boundary", () => {
  test("accepts exactly one authenticated v8 parent port", async () => {
    await withFakeWindow(async (parent) => {
      const host = new StoryboardHost()
      const port = new FakePort()

      expect(host.acceptConnect(connectEvent(parent, port, {
        source: { name: "not-parent" },
      }))).toBeFalse()
      expect(host.acceptConnect(connectEvent(parent, port, {
        data: { protocol: "convax.plugin-host/7", type: "connect", pluginId: PLUGIN_ID },
      }))).toBeFalse()
      expect(host.acceptConnect(connectEvent(parent, port, {
        data: { protocol: PROTOCOL, type: "connect", pluginId: "different-plugin" },
      }))).toBeFalse()
      expect(host.acceptConnect(connectEvent(parent, port, { ports: [] }))).toBeFalse()
      expect(port.started).toBe(0)

      expect(host.acceptConnect(connectEvent(parent, port))).toBeTrue()
      await expect(host.connected).resolves.toBe(host)
      expect(port.started).toBe(1)
      expect(host.acceptConnect(connectEvent(parent, new FakePort()))).toBeFalse()
      host.close()
    })
  })

  test("delegates typed calls and renderer commands to the SDK client", async () => {
    await withFakeWindow(async (parent) => {
      const host = new StoryboardHost({ timeoutMs: 1_000 })
      const port = new FakePort()
      host.acceptConnect(connectEvent(parent, port))

      const commands = []
      const unsubscribe = host.onCommand((command, params) => commands.push({ command, params }))
      port.receive({
        protocol: PROTOCOL,
        type: "command",
        command: "renderer.storyboard.refresh",
        params: { reason: "toolbar" },
      })
      expect(commands).toEqual([
        { command: "renderer.storyboard.refresh", params: { reason: "toolbar" } },
      ])
      unsubscribe()

      const result = host.request("agent.prompt", { text: "Build the storyboard" })
      await Promise.resolve()
      expect(port.messages).toHaveLength(1)
      expect(port.messages[0]).toMatchObject({
        protocol: PROTOCOL,
        type: "request",
        method: "agent.prompt",
        params: { text: "Build the storyboard" },
      })
      port.receive({
        protocol: PROTOCOL,
        type: "response",
        id: port.messages[0].id,
        ok: true,
        result: { text: "accepted" },
      })
      await expect(result).resolves.toEqual({ text: "accepted" })
    })
  })

  test("keeps structured Host failures and closure fail-closed", async () => {
    await withFakeWindow(async (parent) => {
      const host = new StoryboardHost({ timeoutMs: 0 })
      const port = new FakePort()
      host.acceptConnect(connectEvent(parent, port))

      const failed = host.request("agent.prompt", { text: "Build" })
      await Promise.resolve()
      port.receive({
        protocol: PROTOCOL,
        type: "response",
        id: port.messages.at(-1).id,
        ok: false,
        error: {
          kind: "api",
          code: "permission-denied",
          message: "permission denied",
          recoverable: false,
        },
      })
      await expect(failed).rejects.toThrow("permission denied")

      const pending = host.request("agent.prompt", { text: "Continue" })
      await Promise.resolve()
      host.close(new Error("node removed"))
      await expect(pending).rejects.toThrow("closed")
    })
  })
})

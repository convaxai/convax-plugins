import { describe, expect, test } from "bun:test"

import { PLUGIN_ID, PROTOCOL, StoryboardHost } from "../package/assets/host.js"

class FakePort {
  constructor() {
    this.closed = 0
    this.messages = []
    this.started = 0
    this.onmessage = null
    this.onmessageerror = null
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
    this.onmessage?.({ data: message })
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

describe("StoryboardHost MessagePort boundary", () => {
  test("accepts exactly one authenticated parent port and refuses reconnects", async () => {
    await withFakeWindow(async (parent) => {
      const host = new StoryboardHost()
      const port = new FakePort()
      const impostor = { name: "not-parent" }

      expect(host.acceptConnect(connectEvent(parent, port, { source: impostor }))).toBeFalse()
      expect(host.acceptConnect(connectEvent(parent, port, {
        data: { protocol: "convax.plugin-capability/99", type: "connect", pluginId: PLUGIN_ID },
      }))).toBeFalse()
      expect(host.acceptConnect(connectEvent(parent, port, {
        data: { protocol: PROTOCOL, type: "connect", pluginId: "different-plugin" },
      }))).toBeFalse()
      expect(host.acceptConnect(connectEvent(parent, port, { ports: [] }))).toBeFalse()
      expect(host.acceptConnect(connectEvent(parent, port, { ports: [port, new FakePort()] }))).toBeFalse()
      expect(port.started).toBe(0)

      expect(host.acceptConnect(connectEvent(parent, port))).toBeTrue()
      await expect(host.connected).resolves.toBe(host)
      expect(port.started).toBe(1)

      const secondPort = new FakePort()
      expect(host.acceptConnect(connectEvent(parent, secondPort))).toBeFalse()
      expect(secondPort.started).toBe(0)
    })
  })

  test("correlates protocol-scoped responses and ignores spoofed or unrelated messages", async () => {
    await withFakeWindow(async (parent) => {
      const host = new StoryboardHost({ timeoutMs: 1_000 })
      const port = new FakePort()
      host.acceptConnect(connectEvent(parent, port))

      let settled = false
      const result = host.request("canvas.node.getState", { include: "state" })
        .finally(() => {
          settled = true
        })
      await Promise.resolve()

      expect(port.messages).toHaveLength(1)
      expect(port.messages[0]).toMatchObject({
        protocol: PROTOCOL,
        type: "request",
        method: "canvas.node.getState",
        params: { include: "state" },
      })
      const requestId = port.messages[0].id

      port.receive({ protocol: "convax.plugin-capability/99", type: "response", id: requestId, ok: true, result: "spoofed" })
      port.receive({ protocol: PROTOCOL, type: "response", id: "another-request", ok: true, result: "unrelated" })
      await Promise.resolve()
      expect(settled).toBeFalse()

      port.receive({
        protocol: PROTOCOL,
        type: "response",
        id: requestId,
        ok: true,
        result: { state: { selectedEpisodeId: "ep-002" } },
      })
      await expect(result).resolves.toEqual({ state: { selectedEpisodeId: "ep-002" } })
    })
  })

  test("delivers protocol commands and turns host errors or closure into rejected requests", async () => {
    await withFakeWindow(async (parent) => {
      const host = new StoryboardHost({ timeoutMs: 1_000 })
      const port = new FakePort()
      host.acceptConnect(connectEvent(parent, port))

      const commands = []
      const unsubscribe = host.onCommand((command, params) => commands.push({ command, params }))
      port.receive({ protocol: "wrong", type: "command", command: "storyboard.refresh" })
      port.receive({
        protocol: PROTOCOL,
        type: "command",
        command: "storyboard.refresh",
        params: { reason: "toolbar" },
      })
      expect(commands).toEqual([
        { command: "storyboard.refresh", params: { reason: "toolbar" } },
      ])
      unsubscribe()
      port.receive({ protocol: PROTOCOL, type: "command", command: "ignored-after-unsubscribe" })
      expect(commands).toHaveLength(1)

      const failed = host.request("project.file.readText", { path: "Storyboards/demo/story.json" })
      await Promise.resolve()
      const failedId = port.messages.at(-1).id
      port.receive({
        protocol: PROTOCOL,
        type: "response",
        id: failedId,
        ok: false,
        error: "permission denied",
      })
      await expect(failed).rejects.toThrow("permission denied")

      const pending = host.request("agent.prompt", { prompt: "build" }, { timeoutMs: 0 })
      await Promise.resolve()
      host.close(new Error("node removed"))
      await expect(pending).rejects.toThrow("node removed")
      expect(port.closed).toBe(1)
    })
  })
})

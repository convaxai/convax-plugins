#!/usr/bin/env bun

import { NexusMcpServer } from "./mcp-server.ts"

const shutdownGracePeriodMs = 5_000

export function createServer() {
  return new NexusMcpServer()
}

async function run() {
  if (process.argv.length > 2) throw new Error("Usage: convax-nexus-mcp")
  const server = createServer()
  let shutdown: Promise<boolean> | undefined
  const stop = () => {
    shutdown ??= server.shutdown(shutdownGracePeriodMs)
    void shutdown.then(
      (drained) => {
        if (!drained) console.error("[nexus] shutdown grace period expired")
        process.exit(0)
      },
      () => process.exit(1),
    )
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    await server.run()
  } finally {
    try {
      await (shutdown ?? server.shutdown(shutdownGracePeriodMs))
    } finally {
      process.removeListener("SIGINT", stop)
      process.removeListener("SIGTERM", stop)
    }
  }
}

if (import.meta.main) await run()

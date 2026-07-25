#!/usr/bin/env convax-bun

import { MediaImportEngine } from "./importer.ts"
import { McpServer } from "./mcp-server.ts"

const shutdownGracePeriodMs = 5_000

export function createServer() {
  return new McpServer(new MediaImportEngine())
}

async function runMcpServer() {
  const server = createServer()
  let shutdown: Promise<boolean> | undefined
  const stop = () => {
    shutdown ??= server.shutdown(shutdownGracePeriodMs)
    void shutdown.then(
      (drained) => {
        if (!drained) console.error("[chatcut-media-import] shutdown grace period expired")
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

if (import.meta.main) {
  if (process.argv.length !== 2) {
    throw new Error("Usage: convax-chatcut-media-import-mcp")
  }
  await runMcpServer()
}

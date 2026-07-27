#!/usr/bin/env convax-bun

import { McpServer } from "./mcp-server.ts"

async function main() {
  if (process.argv.length !== 2) throw new Error("Usage: convax-jianying-editor-mcp")
  const server = new McpServer()
  let shutdown: Promise<boolean> | undefined
  const stop = () => {
    shutdown ??= server.shutdown(5_000)
    void shutdown.then((drained) => process.exit(drained ? 0 : 1), () => process.exit(1))
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    await server.run()
  } finally {
    process.removeListener("SIGINT", stop)
    process.removeListener("SIGTERM", stop)
    await (shutdown ?? server.shutdown(5_000))
  }
}

if (import.meta.main) await main()

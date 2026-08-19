#!/usr/bin/env convax-bun

import { providerIds, type ProviderId } from "./contracts.ts"
import { createServer } from "./runtime.ts"
import { thirdPartyNotices } from "./third-party-notices.ts"

const shutdownGracePeriodMs = 5_000

export function parseProviderArgument(args: readonly string[]): ProviderId {
  if (args.length !== 1 || !args[0]?.startsWith("--provider=")) {
    throw new Error(
      "Usage: convax-shortdrama-router-mcp --provider=xiaoyunque|libtv|jimeng",
    )
  }
  const provider = args[0].slice("--provider=".length)
  if (!providerIds.includes(provider as ProviderId)) {
    throw new Error(
      "Usage: convax-shortdrama-router-mcp --provider=xiaoyunque|libtv|jimeng",
    )
  }
  return provider as ProviderId
}

async function run() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === "--third-party-notices") {
    await Bun.stdout.write(thirdPartyNotices)
    return
  }
  const provider = parseProviderArgument(args)
  const server = await createServer(provider)
  let shutdown: Promise<boolean> | undefined
  const stop = () => {
    shutdown ??= server.shutdown(shutdownGracePeriodMs)
    void shutdown.then(
      (drained) => {
        if (!drained) {
          console.error(
            `[shortdrama-router:${provider}] shutdown grace period expired`,
          )
        }
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

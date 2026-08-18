import path from "node:path"

import type { ProviderId } from "./contracts.ts"

function absoluteEnvironmentPath(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
) {
  const value = environment[name]?.trim()
  return value && path.isAbsolute(value) ? value : undefined
}

export function defaultProviderStateDirectory(
  provider: ProviderId,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const xdg = absoluteEnvironmentPath(environment, "XDG_DATA_HOME")
  if (xdg) {
    return path.join(xdg, "convax", "shortdrama-router", provider)
  }
  const userHome = absoluteEnvironmentPath(environment, "HOME")
  if (!userHome) {
    throw new Error("A valid home directory is required for provider state")
  }
  const root = process.platform === "darwin"
    ? path.join(
        userHome,
        "Library",
        "Application Support",
        "Convax",
        "ShortDramaRouter",
      )
    : path.join(userHome, ".local", "share", "convax", "shortdrama-router")
  return path.join(root, provider)
}

import { getDefaultResultOrder, setDefaultResultOrder } from "node:dns"

import { afterEach, describe, expect, test } from "bun:test"

import { configureNetworkPreference } from "../src/index.ts"

const originalOrder = getDefaultResultOrder()

afterEach(() => setDefaultResultOrder(originalOrder))

describe("Nexus companion network preference", () => {
  test("prefers IPv6 while retaining the runtime's IPv4 fallback", () => {
    configureNetworkPreference()

    expect(getDefaultResultOrder()).toBe("ipv6first")
  })
})

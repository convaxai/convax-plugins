import { getDefaultResultOrder, setDefaultResultOrder } from "node:dns"

import { afterEach, describe, expect, test } from "bun:test"

import { configureNetworkPreference } from "../src/index.ts"
import { createProductionIpv6Fetch } from "../src/production-network-fetch.ts"

const originalOrder = getDefaultResultOrder()

afterEach(() => setDefaultResultOrder(originalOrder))

describe("Nexus companion network preference", () => {
  test("prefers IPv6 while retaining the runtime's IPv4 fallback", () => {
    configureNetworkPreference()

    expect(getDefaultResultOrder()).toBe("ipv6first")
  })

  test.each([
    "authx.microvoid.io",
    "nexus.microvoid.io",
    "gateway.nexus.microvoid.io",
  ])("pins production %s requests to an authenticated IPv6 transport", async (hostname) => {
    const calls: Array<{
      request: Request
      tlsServerName: string | undefined
    }> = []
    const routedFetch = createProductionIpv6Fetch({
      async fetch(input, init) {
        calls.push({
          request: input instanceof Request ? input : new Request(input, init),
          tlsServerName: init?.tls?.serverName,
        })
        return new Response("{}", { status: 200 })
      },
      async lookup(actualHostname) {
        expect(actualHostname).toBe(hostname)
        return [{ address: "2001:db8::42", family: 6 }]
      },
    })

    await routedFetch(new URL(`https://${hostname}/oauth/token`), {
      body: "grant_type=refresh_token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      redirect: "error",
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.request.url).toBe("https://[2001:db8::42]/oauth/token")
    expect(calls[0]!.request.headers.get("host")).toBe(hostname)
    expect(calls[0]!.request.redirect).toBe("error")
    expect(calls[0]!.request.method).toBe("POST")
    expect(await calls[0]!.request.text()).toBe("grant_type=refresh_token")
    expect(calls[0]!.tlsServerName).toBe(hostname)
  })

  test("fails closed when a production service has no IPv6 address", async () => {
    let fetched = false
    const routedFetch = createProductionIpv6Fetch({
      async fetch() {
        fetched = true
        return new Response(null, { status: 200 })
      },
      async lookup() {
        return [{ address: "192.0.2.42", family: 4 }]
      },
    })

    await expect(
      routedFetch("https://nexus.microvoid.io/api/v1/application-access/status"),
    ).rejects.toThrow("Production service IPv6 resolution failed")
    expect(fetched).toBeFalse()
  })

  test("leaves local-development requests on the ordinary fetch path", async () => {
    let lookedUp = false
    let fetchedUrl = ""
    const routedFetch = createProductionIpv6Fetch({
      async fetch(input) {
        fetchedUrl = String(input)
        return new Response(null, { status: 204 })
      },
      async lookup() {
        lookedUp = true
        return [{ address: "2001:db8::42", family: 6 }]
      },
    })

    const response = await routedFetch("http://127.0.0.1:18401/status")

    expect(response.status).toBe(204)
    expect(fetchedUrl).toBe("http://127.0.0.1:18401/status")
    expect(lookedUp).toBeFalse()
  })
})

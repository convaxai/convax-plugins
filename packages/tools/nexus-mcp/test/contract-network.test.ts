import { getDefaultResultOrder, setDefaultResultOrder } from "node:dns";

import { afterEach, describe, expect, test } from "bun:test";

import { configureNetworkPreference } from "../src/index.ts";
import { createProductionFetch } from "../src/production-network-fetch.ts";

const originalOrder = getDefaultResultOrder();

afterEach(() => setDefaultResultOrder(originalOrder));

describe("Nexus companion network preference", () => {
  test("prefers IPv6 while retaining the runtime's IPv4 fallback", () => {
    configureNetworkPreference();

    expect(getDefaultResultOrder()).toBe("ipv6first");
  });

  test.each([
    "authx.microvoid.io",
    "nexus.microvoid.io",
    "gateway.nexus.microvoid.io",
  ])(
    "prefers a reachable authenticated IPv6 transport for production %s",
    async (hostname) => {
      const calls: Array<{
        request: Request;
        tlsServerName: string | undefined;
      }> = [];
      const routedFetch = createProductionFetch({
        async fetch(input, init) {
          calls.push({
            request:
              input instanceof Request ? input : new Request(input, init),
            tlsServerName: init?.tls?.serverName,
          });
          return new Response("{}", { status: 200 });
        },
        async lookup(actualHostname) {
          expect(actualHostname).toBe(hostname);
          return [{ address: "2001:db8::42", family: 6 }];
        },
      });

      await routedFetch(new URL(`https://${hostname}/oauth/token`), {
        body: "grant_type=refresh_token",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        redirect: "error",
      });

      expect(calls).toHaveLength(2);
      expect(calls[0]!.request.url).toBe("https://[2001:db8::42]/");
      expect(calls[0]!.request.method).toBe("HEAD");
      expect(calls[0]!.request.headers.get("host")).toBe(hostname);
      expect(calls[0]!.tlsServerName).toBe(hostname);
      expect(calls[1]!.request.url).toBe("https://[2001:db8::42]/oauth/token");
      expect(calls[1]!.request.headers.get("host")).toBe(hostname);
      expect(calls[1]!.request.redirect).toBe("error");
      expect(calls[1]!.request.method).toBe("POST");
      expect(await calls[1]!.request.text()).toBe("grant_type=refresh_token");
      expect(calls[1]!.tlsServerName).toBe(hostname);
    },
  );

  test("retains the same-authority runtime fallback when IPv6 is unavailable", async () => {
    const calls: Array<{
      request: Request;
      tlsServerName: string | undefined;
    }> = [];
    const routedFetch = createProductionFetch({
      async fetch(input, init) {
        calls.push({
          request: input instanceof Request ? input : new Request(input, init),
          tlsServerName: init?.tls?.serverName,
        });
        return new Response(null, { status: 200 });
      },
      async lookup() {
        return [{ address: "192.0.2.42", family: 4 }];
      },
    });

    await routedFetch(
      "https://nexus.microvoid.io/api/v1/application-access/status",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.request.url).toBe(
      "https://nexus.microvoid.io/api/v1/application-access/status",
    );
    expect(calls[0]!.tlsServerName).toBeUndefined();
  });

  test("does not replay a non-idempotent request when its selected route fails", async () => {
    const calls: Request[] = [];
    const routedFetch = createProductionFetch({
      async fetch(input, init) {
        const request =
          input instanceof Request ? input : new Request(input, init);
        calls.push(request);
        if (request.method === "POST") throw new Error("transport failed");
        return new Response(null, { status: 204 });
      },
      async lookup() {
        return [{ address: "2001:db8::42", family: 6 }];
      },
    });

    await expect(
      routedFetch("https://authx.microvoid.io/oauth/token", {
        body: "grant_type=authorization_code",
        method: "POST",
      }),
    ).rejects.toThrow("transport failed");
    expect(calls).toHaveLength(2);
    expect(calls.map((request) => request.method)).toEqual(["HEAD", "POST"]);
  });

  test("leaves local-development requests on the ordinary fetch path", async () => {
    let lookedUp = false;
    let fetchedUrl = "";
    const routedFetch = createProductionFetch({
      async fetch(input) {
        fetchedUrl = String(input);
        return new Response(null, { status: 204 });
      },
      async lookup() {
        lookedUp = true;
        return [{ address: "2001:db8::42", family: 6 }];
      },
    });

    const response = await routedFetch("http://127.0.0.1:18401/status");

    expect(response.status).toBe(204);
    expect(fetchedUrl).toBe("http://127.0.0.1:18401/status");
    expect(lookedUp).toBeFalse();
  });
});

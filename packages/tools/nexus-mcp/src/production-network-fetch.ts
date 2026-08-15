import { dns } from "bun";
import { isIP } from "node:net";

const productionOrigins = new Set([
  "https://authx.microvoid.io",
  "https://gateway.nexus.microvoid.io",
  "https://nexus.microvoid.io",
]);

type BunNetworkFetch = (
  input: RequestInfo | URL,
  init?: BunFetchRequestInit,
) => Promise<Response>;

interface ProductionIpv6FetchDependencies {
  fetch?: BunNetworkFetch;
  lookup?: (
    hostname: string,
  ) => Promise<readonly { address: string; family?: number }[]>;
}

/**
 * Production traffic is pinned to an authenticated IPv6 transport. Some managed
 * desktop networks complete Cloudflare's IPv4 TCP handshake and then reset TLS,
 * so DNS result ordering alone is not sufficient. The original hostname remains
 * both the HTTP Host and TLS server name; certificate verification stays enabled.
 */
export function createProductionIpv6Fetch(
  dependencies: ProductionIpv6FetchDependencies = {},
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const fetchRequest = dependencies.fetch ?? fetch;
  const lookup =
    dependencies.lookup ??
    ((hostname: string) => dns.lookup(hostname, { family: 6 }));

  return async (input, init) => {
    const request = new Request(input, init);
    const originalUrl = new URL(request.url);
    if (!productionOrigins.has(originalUrl.origin)) {
      return fetchRequest(input, init);
    }

    const addresses = await lookup(originalUrl.hostname);
    const address = addresses.find(
      (candidate) =>
        (candidate.family === undefined || candidate.family === 6) &&
        isIP(candidate.address) === 6,
    )?.address;
    if (!address) {
      throw new Error("Production service IPv6 resolution failed");
    }

    const routedUrl = new URL(originalUrl);
    routedUrl.hostname = `[${address}]`;
    const routedRequest = new Request(routedUrl, request);
    routedRequest.headers.set("host", originalUrl.hostname);
    return fetchRequest(routedRequest, {
      tls: { serverName: originalUrl.hostname },
    });
  };
}

export const productionIpv6Fetch = createProductionIpv6Fetch();

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

interface ProductionFetchDependencies {
  fetch?: BunNetworkFetch;
  lookup?: (
    hostname: string,
  ) => Promise<readonly { address: string; family?: number }[]>;
  now?: () => number;
  probeTimeoutMs?: number;
}

/**
 * Production traffic prefers an authenticated IPv6 transport when it is actually
 * reachable, then retains Bun's same-authority IPv4 fallback. The public probe is
 * separate from the caller request so a non-idempotent OAuth or generation POST
 * is sent exactly once. The original hostname remains both the HTTP Host and TLS
 * server name; certificate verification stays enabled on either path.
 */
export function createProductionFetch(
  dependencies: ProductionFetchDependencies = {},
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const fetchRequest = dependencies.fetch ?? fetch;
  const lookup =
    dependencies.lookup ??
    ((hostname: string) => dns.lookup(hostname, { family: 6 }));
  const now = dependencies.now ?? Date.now;
  const probeTimeoutMs = dependencies.probeTimeoutMs ?? 2_000;
  const routeMaximumAgeMs = 30_000;
  const routes = new Map<
    string,
    { address: string | undefined; expiresAt: number }
  >();

  return async (input, init) => {
    const request = new Request(input, init);
    const originalUrl = new URL(request.url);
    if (!productionOrigins.has(originalUrl.origin)) {
      return fetchRequest(input, init);
    }

    const cached = routes.get(originalUrl.origin);
    const selectedAt = now();
    const hasFreshRoute = cached !== undefined && cached.expiresAt > selectedAt;
    const address =
      hasFreshRoute
        ? cached.address
        : await selectReachableIpv6Address(
            originalUrl,
            request.signal,
            fetchRequest,
            lookup,
            probeTimeoutMs,
          );
    if (!hasFreshRoute) {
      routes.set(originalUrl.origin, {
        address,
        expiresAt: selectedAt + routeMaximumAgeMs,
      });
    }
    if (!address) return fetchRequest(request);

    const routedUrl = new URL(originalUrl);
    routedUrl.hostname = `[${address}]`;
    const routedRequest = new Request(routedUrl, request.clone());
    routedRequest.headers.set("host", originalUrl.hostname);
    return fetchRequest(routedRequest, {
      tls: { serverName: originalUrl.hostname },
    });
  };
}

async function selectReachableIpv6Address(
  originalUrl: URL,
  callerSignal: AbortSignal,
  fetchRequest: BunNetworkFetch,
  lookup: NonNullable<ProductionFetchDependencies["lookup"]>,
  probeTimeoutMs: number,
): Promise<string | undefined> {
  let addresses: readonly { address: string; family?: number }[];
  try {
    addresses = await lookup(originalUrl.hostname);
  } catch {
    return undefined;
  }
  for (const candidate of addresses) {
    if (
      (candidate.family !== undefined && candidate.family !== 6) ||
      isIP(candidate.address) !== 6
    ) {
      continue;
    }
    const routedUrl = new URL("/", originalUrl);
    routedUrl.hostname = `[${candidate.address}]`;
    const probe = new Request(routedUrl, {
      headers: { host: originalUrl.hostname },
      method: "HEAD",
      redirect: "error",
      signal: AbortSignal.any([
        callerSignal,
        AbortSignal.timeout(probeTimeoutMs),
      ]),
    });
    try {
      await fetchRequest(probe, {
        tls: { serverName: originalUrl.hostname },
      });
      return candidate.address;
    } catch {
      if (callerSignal.aborted) throw callerSignal.reason;
    }
  }
  return undefined;
}

export const productionFetch = createProductionFetch();

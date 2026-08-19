import { lookup } from "node:dns/promises"
import type { IncomingMessage } from "node:http"
import https from "node:https"
import net from "node:net"

const nonPublicIpv6Addresses = new net.BlockList()

for (const [address, prefix] of [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["::ffff:0:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  nonPublicIpv6Addresses.addSubnet(address, prefix, "ipv6")
}

export interface DownloadSource {
  contentLength: number | null
  contentType: string | null
  stream: AsyncIterable<Uint8Array>
}

export type DownloadOpener = (
  rawUrl: string,
  signal: AbortSignal,
) => Promise<DownloadSource>

function ipv4IsPublic(address: string) {
  const parts = address.split(".").map(Number)
  if (
    parts.length !== 4
    || parts.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255,
    )
  ) {
    return false
  }
  const [a, b] = parts as [number, number, number, number]
  return !(
    a === 0
    || a === 10
    || a === 127
    || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0)
  )
}

function networkAddressIsPublic(address: string) {
  const family = net.isIP(address)
  if (family === 4) return ipv4IsPublic(address)
  if (family === 6) {
    return !nonPublicIpv6Addresses.check(
      address.toLowerCase().split("%", 1)[0]!,
      "ipv6",
    )
  }
  return false
}

function normalizedHostname(hostname: string) {
  const value = hostname.toLowerCase().replace(/\.$/u, "")
  return value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value
}

function validateArtifactUrl(url: URL) {
  if (
    url.protocol !== "https:"
    || (url.port !== "" && url.port !== "443")
    || url.username
    || url.password
  ) {
    throw new Error("Provider artifact URL is unsafe")
  }
  const hostname = normalizedHostname(url.hostname)
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || (net.isIP(hostname) !== 0 && !networkAddressIsPublic(hostname))
  ) {
    throw new Error("Provider artifact URL is unsafe")
  }
}

async function pinnedRequest(url: URL, signal: AbortSignal) {
  const hostname = normalizedHostname(url.hostname)
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (
    addresses.length === 0
    || addresses.some((entry) => !networkAddressIsPublic(entry.address))
  ) {
    throw new Error("Provider artifact host is unsafe")
  }
  const selected = addresses[0]!
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "audio/*, image/*, video/*, application/octet-stream;q=0.1",
        },
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) {
            callback(null, [selected])
          } else {
            callback(null, selected.address, selected.family)
          }
        },
        signal,
      },
      resolve,
    )
    request.once("error", reject)
  })
}

export const openSafeDownload: DownloadOpener = async (rawUrl, signal) => {
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError")
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error("Provider artifact URL is invalid")
  }
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    if (signal.aborted) throw new DOMException("Download cancelled", "AbortError")
    validateArtifactUrl(url)
    const response = await pinnedRequest(url, signal)
    const responseStatus = response.statusCode ?? 0
    if (responseStatus >= 300 && responseStatus < 400) {
      const location = response.headers.location
      response.resume()
      if (!location || redirects === 5) {
        throw new Error("Provider artifact redirect was rejected")
      }
      url = new URL(location, url)
      continue
    }
    if (responseStatus < 200 || responseStatus >= 300) {
      response.resume()
      throw new Error("Provider artifact download was rejected")
    }
    const rawLength = response.headers["content-length"]
    const parsedLength = rawLength === undefined ? Number.NaN : Number(rawLength)
    const rawContentType = response.headers["content-type"]
    return {
      contentLength:
        Number.isSafeInteger(parsedLength) && parsedLength >= 0
          ? parsedLength
          : null,
      contentType:
        typeof rawContentType === "string"
          ? rawContentType.split(";", 1)[0]!.trim().toLowerCase()
          : null,
      stream: response,
    }
  }
  throw new Error("Provider artifact redirected too many times")
}

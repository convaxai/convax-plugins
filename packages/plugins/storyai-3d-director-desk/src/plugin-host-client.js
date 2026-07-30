import {
  createPluginHostClient,
  isPluginHostConnect,
} from "@convax/plugin-sdk/client"
import manifest from "../package/manifest.json"

export const pluginSdkClientBundleMarker =
  "@convax/plugin-sdk/client:createPluginHostClient"

export function acceptPluginHostConnection(event, options = {}) {
  if (
    event.source !== window.parent ||
    event.ports.length !== 1 ||
    !isPluginHostConnect(event.data) ||
    event.data.pluginId !== manifest.id
  ) {
    return null
  }
  return createPluginHostClient({
    manifest,
    onFatalError: options.onFatalError,
    port: event.ports[0],
    requestIdPrefix: options.requestIdPrefix,
  })
}

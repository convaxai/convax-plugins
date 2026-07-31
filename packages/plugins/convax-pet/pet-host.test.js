import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"

describe("SDK-owned Pet surface boundary", () => {
  test("bundles the public Pet client without author-supplied Plugin identity", async () => {
    const [author, bundle, overlay, settings] = await Promise.all([
      fs.readFile(new URL("./src/pet-host-client.js", import.meta.url), "utf8"),
      fs.readFile(new URL("./package/assets/pet-host-client.js", import.meta.url), "utf8"),
      fs.readFile(new URL("./package/pet/app.js", import.meta.url), "utf8"),
      fs.readFile(new URL("./package/settings/app.js", import.meta.url), "utf8"),
    ])

    expect(author).toContain('from "@convax/plugin-sdk/pet-client"')
    expect(bundle).toContain("@convax/plugin-sdk/pet-client:connectPetHost")
    expect(bundle).toContain("convax.pet-host/1")
    expect(`${author}\n${overlay}\n${settings}`).not.toMatch(/pluginId\s*:/u)
    expect(overlay).toContain('connectPetHost({ surface: "overlay" })')
    expect(settings).toContain('connectPetHost({ surface: "settings" })')
  })

  test("bundles the public system light/dark UI foundation before Pet composition", async () => {
    const [theme, overlayHtml, settingsHtml, overlayCss, settingsCss] = await Promise.all([
      fs.readFile(new URL("./package/assets/plugin-theme.css", import.meta.url), "utf8"),
      fs.readFile(new URL("./package/pet/index.html", import.meta.url), "utf8"),
      fs.readFile(new URL("./package/settings/index.html", import.meta.url), "utf8"),
      fs.readFile(new URL("./package/pet/styles.css", import.meta.url), "utf8"),
      fs.readFile(new URL("./package/settings/styles.css", import.meta.url), "utf8"),
    ])
    expect(theme).toContain("--ui-surface-canvas:")
    expect(theme).toContain("@media (prefers-color-scheme: dark)")
    expect(theme).not.toContain("@import")
    for (const html of [overlayHtml, settingsHtml]) {
      expect(html.indexOf("../assets/plugin-theme.css")).toBeLessThan(html.indexOf("styles.css"))
    }
    for (const composition of [overlayCss, settingsCss]) {
      expect(composition).toContain("var(--ui-")
      expect(composition).not.toMatch(/#[0-9a-f]{3,8}\b/iu)
    }
  })
})

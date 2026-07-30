import { describe, expect, test } from "bun:test"
import { lstat, readFile } from "node:fs/promises"
import path from "node:path"

const packageRoot = path.resolve(import.meta.dir, "../package")

describe("storyboard production workbench", () => {
  test("ships the four-pane segment production hierarchy", async () => {
    const html = await readFile(path.join(packageRoot, "index.html"), "utf8")
    for (const id of [
      "episodeSelect",
      "assetList",
      "segmentScript",
      "previewStage",
      "segmentTimeline",
      "characterDrawer",
    ]) {
      expect(html).toContain(`id="${id}"`)
    }
    for (const tab of ["characters", "locations", "materials", "props"]) {
      expect(html).toContain(`data-asset-tab="${tab}"`)
    }
    expect(html).toContain('data-library-scope="episode"')
    expect(html).toContain('data-library-scope="story"')
    expect(html).toContain("片段预览")
    expect(html).toContain("智能预演")
    expect(html).toContain("合成本集")
  })

  test("uses bundled original demo media instead of remote or CSS-only placeholders", async () => {
    const css = await readFile(path.join(packageRoot, "assets/styles.css"), "utf8")
    expect(css).toContain('url("./demo-shots.jpg")')
    expect(css).toContain('url("./demo-characters.jpg")')
    expect(css).toContain('"library editor preview"')
    expect(css).toContain('"library timeline timeline"')

    for (const filename of ["demo-shots.jpg", "demo-characters.jpg"]) {
      const stat = await lstat(path.join(packageRoot, "assets", filename))
      expect(stat.isFile()).toBeTrue()
      expect(stat.isSymbolicLink()).toBeFalse()
      expect(stat.size).toBeGreaterThan(50_000)
      expect(stat.size).toBeLessThan(500_000)
    }
  })

  test("keeps media generation and Project persistence honest in the UI copy", async () => {
    const [html, app] = await Promise.all([
      readFile(path.join(packageRoot, "index.html"), "utf8"),
      readFile(path.join(packageRoot, "assets/app.js"), "utf8"),
    ])
    expect(html).toContain("关键帧预演 · 非成片")
    expect(html).toContain("成本待确认")
    expect(app).toContain("no provider or final cost has yet been confirmed")
    expect(app).toContain("does not authorize paid or bulk image/audio/video generation")
    expect(app).toContain("本地编辑中 · 尚未写入 Project")
    expect(app).toContain("当前 renderer 没有受管媒体流")
    expect(app).toContain("if (!demoMode)")
    expect(html).toContain('aria-label="查看媒体引用"')
  })

  test("persists production preferences and saves dragged asset references", async () => {
    const app = await readFile(path.join(packageRoot, "assets/app.js"), "utf8")
    expect(app).toContain("currentProductionPreferences")
    expect(app).toContain("User production preferences")
    expect(app).toContain("generationInFlight")
    expect(app).toContain("locationAssetId: segment.locationAssetId")
    expect(app).toContain("assetRefs: [...segment.assetRefs]")
    expect(app).toContain("partialLoadSummary")
    expect(app).toContain("故事板已创建，部分载入")
    expect(app).toContain("已刷新，故事板部分载入")
  })
})

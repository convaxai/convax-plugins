import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  assertPortablePluginStateValueV1,
  parsePortablePluginStateSchemaV1,
} from "@convax/plugin-sdk"

import {
  HOST_RAW_STATE_BYTE_LIMIT,
  decodePersistedHostState,
  encodePersistedHostState,
  isStateEnvelope,
} from "../src/state-envelope.js"

const pluginRoot = path.resolve(import.meta.dir, "..")

async function readManifest() {
  return JSON.parse(await readFile(path.join(pluginRoot, "package", "manifest.json"), "utf8"))
}

const representativeScene = Object.freeze({
  schemaVersion: 2,
  directorProject: {
    version: 1,
    assets: [],
    objects: [
      {
        id: "obj-1",
        kind: "prop",
        position: [1.25, 0, -2.5],
        rotation: [0, 0.785, 0],
        scale: [1, 1, 1],
      },
    ],
    cameras: [
      {
        id: "cam-1",
        position: [0, 1.6, 4],
        target: [0, 1, 0],
        fov: 35.5,
        captures: [],
        lastCaptureUrl: null,
      },
    ],
    scene: {
      backgroundColor: "#101018",
    },
    panoramaAssetId: null,
    activeCameraId: "cam-1",
  },
  presentation: {
    viewport: {
      directorView: {
        fov: 35.5,
        position: [0, 1.6, 4],
        target: [0, 1, 0],
      },
    },
  },
})

describe("storyai-3d-director-desk portable stateSchema", () => {
  test("admits empty object and a closed base64 envelope", async () => {
    const manifest = await readManifest()
    const schema = parsePortablePluginStateSchemaV1(
      manifest.contributes.canvas.renderer.stateSchema,
    )
    const envelope = encodePersistedHostState(representativeScene)
    expect(envelope).not.toBeNull()
    expect(isStateEnvelope(envelope)).toBeTrue()
    expect(() => assertPortablePluginStateValueV1(schema, {})).not.toThrow()
    expect(() => assertPortablePluginStateValueV1(schema, envelope)).not.toThrow()
  })

  test("rejects floats and non-envelope shapes at the Host schema boundary", async () => {
    const manifest = await readManifest()
    const schema = parsePortablePluginStateSchemaV1(
      manifest.contributes.canvas.renderer.stateSchema,
    )
    expect(() => assertPortablePluginStateValueV1(schema, representativeScene)).toThrow()
    expect(() =>
      assertPortablePluginStateValueV1(schema, {
        schemaVersion: 1,
        encoding: "base64-json-utf8",
        payload: 12.5,
      }),
    ).toThrow()
    expect(() =>
      assertPortablePluginStateValueV1(schema, {
        schemaVersion: 1,
        encoding: "base64-json-utf8",
        payload: "not-base64!!!",
        extra: true,
      }),
    ).toThrow()
  })

  test("encodes after validating finite numbers and re-validates on decode", () => {
    const envelope = encodePersistedHostState(representativeScene)
    expect(envelope).not.toBeNull()
    const decoded = decodePersistedHostState(envelope)
    expect(decoded).toEqual({
      ok: true,
      kind: "ready",
      scene: representativeScene,
    })

    const invalid = {
      ...representativeScene,
      presentation: {
        viewport: {
          directorView: {
            ...representativeScene.presentation.viewport.directorView,
            fov: Number.POSITIVE_INFINITY,
          },
        },
      },
    }
    expect(() => encodePersistedHostState(invalid)).toThrow(/non-finite/u)

    const legacy = decodePersistedHostState(representativeScene)
    expect(legacy.ok).toBeTrue()
    expect(legacy.kind).toBe("ready")
    expect(legacy.scene).toEqual(representativeScene)
  })

  test("raw JSON limit leaves headroom for base64 expansion under 64 KiB strings", () => {
    expect(HOST_RAW_STATE_BYTE_LIMIT).toBe(Math.floor((64 * 1024 * 3) / 4))
    const oversized = {
      ...representativeScene,
      directorProject: {
        ...representativeScene.directorProject,
        scene: {
          backgroundColor: "#101018",
          padding: "x".repeat(HOST_RAW_STATE_BYTE_LIMIT),
        },
      },
    }
    expect(encodePersistedHostState(oversized)).toBeNull()
  })
})

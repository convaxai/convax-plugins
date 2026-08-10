import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NexusVideoGenerator } from "../src/video-generator.ts";
import type { NexusVideoRoute } from "../src/nexus-client.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

describe("NexusVideoGenerator", () => {
  test("writes one validated OpenRouter video artifact through the host-owned output directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "convax-video-generator-"));
    roots.push(root);
    const route: NexusVideoRoute = {
      complete: async () => ({
        bytes: Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
        mimeType: "video/mp4",
      }),
      isCurrent: () => true,
      maximumAgeMs: 60_000,
      models: [
        { id: "google/veo-3.1", name: "Google: Veo 3.1", outputModalities: ["video"] },
      ],
    };
    const artifacts = await new NexusVideoGenerator().generate(
      {
        model: "google/veo-3.1",
        operation_id: "video-operation-1",
        output: "video",
        output_directory: root,
        prompt: "A paper boat crossing a quiet lake.",
        references: [],
        schema: "convax.generation-call/1",
      },
      () => route,
      new AbortController().signal,
    );

    expect(artifacts).toEqual([
      { mimeType: "video/mp4", name: "convax-video-operation-1.mp4", path: "convax-video-operation-1.mp4" },
    ]);
    expect(await fs.readFile(path.join(root, artifacts[0]!.path))).toEqual(
      Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    );
  });
});

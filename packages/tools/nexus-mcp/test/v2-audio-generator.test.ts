import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NexusAudioGenerator } from "../src/audio-generator.ts";

const roots: string[] = [];
const mp3 = Uint8Array.from([
  0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0xff, 0xfb,
]);

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("Nexus audio generation", () => {
  test("materializes raw speech and forwards arbitrary provider JSON unchanged", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-audio-v2-"),
    );
    roots.push(root);
    let completions = 0;
    let forwardedParameters: unknown;
    const route = {
      async complete(
        _model: unknown,
        _prompt: string,
        providerParameters: unknown,
      ) {
        completions += 1;
        forwardedParameters = providerParameters;
        return { bytes: mp3, mimeType: "audio/mpeg" as const };
      },
      isCurrent: () => true,
      maximumAgeMs: 60_000,
      models: [
        {
          id: "fake/audio-v1",
          name: "Fake Audio",
          outputModalities: ["audio", "speech"],
        },
      ],
    };
    const input = {
      instructions: "Speak like a calm radio host.",
      model: "fake/audio-v1",
      operation_id: "audio-operation-v2",
      output: "audio",
      output_directory: root,
      prompt: "Convax audio is connected.",
      provider: {
        allow_fallbacks: false,
        order: ["openai"],
        options: { openai: { latency: "balanced" } },
      },
      references: [],
      response_format: "mp3",
      schema: "convax.generation-call/1",
      speed: 1.25,
      vendor_null: null,
      voice: "alloy",
    };
    const generator = new NexusAudioGenerator();
    const first = await generator.generate(
      input,
      () => route,
      new AbortController().signal,
    );
    const repeated = await generator.generate(
      input,
      () => {
        throw new Error("Repeated calls must reuse the operation result");
      },
      new AbortController().signal,
    );
    expect(repeated).toEqual(first);
    expect(completions).toBe(1);
    expect(forwardedParameters).toEqual({
      instructions: "Speak like a calm radio host.",
      provider: {
        allow_fallbacks: false,
        order: ["openai"],
        options: { openai: { latency: "balanced" } },
      },
      response_format: "mp3",
      speed: 1.25,
      vendor_null: null,
      voice: "alloy",
    });
    expect(first).toEqual([
      {
        mimeType: "audio/mpeg",
        name: "nexus-audio-operation-v2.mp3",
        path: "nexus-audio-operation-v2.mp3",
      },
    ]);
    expect(await fs.readFile(path.join(root, first[0]!.path))).toEqual(
      Buffer.from(mp3),
    );

    await expect(
      new NexusAudioGenerator().generate(
        input,
        () => route,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });
});

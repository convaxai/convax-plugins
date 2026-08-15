import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NexusImageGenerator } from "../src/image-generator.ts";

const roots: string[] = [];
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("Nexus image generation", () => {
  test("validates the artifact and preserves no-clobber output semantics", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-image-v2-"),
    );
    roots.push(root);
    let completions = 0;
    let forwardedParameters: unknown;
    const route = {
      async complete(_model: unknown, _prompt: string, providerParameters: unknown) {
        completions += 1;
        forwardedParameters = providerParameters;
        return {
          data: [
            {
              b64_json: png.toString("base64"),
              media_type: "image/png",
            },
          ],
        };
      },
      isCurrent: () => true,
      maximumAgeMs: 60_000,
      models: [
        {
          id: "fake/image-v1",
          name: "Fake Image",
          outputModalities: ["image"],
        },
      ],
    };
    const input = {
      aspect_ratio: "1:1",
      background: "transparent",
      model: "fake/image-v1",
      n: 1,
      operation_id: "image-operation-v2",
      output: "image",
      output_directory: root,
      prompt: "A deterministic red circle.",
      quality: "high",
      references: [],
      schema: "convax.generation-call/1",
      vendor_turbo: true,
    };
    const generator = new NexusImageGenerator();
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
      aspect_ratio: "1:1",
      background: "transparent",
      n: 1,
      quality: "high",
      vendor_turbo: true,
    });
    expect(first).toEqual([
      {
        mimeType: "image/png",
        name: "nexus-image-operation-v2-1.png",
        path: "nexus-image-operation-v2-1.png",
      },
    ]);
    expect(path.isAbsolute(first[0]!.path)).toBeFalse();
    expect(await fs.readFile(path.join(root, first[0]!.path))).toEqual(png);

    await expect(
      new NexusImageGenerator().generate(
        input,
        () => route,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await fs.readFile(path.join(root, first[0]!.path))).toEqual(png);
  });

  test("rejects unsupported artifact bytes before materialization", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-image-v2-"),
    );
    roots.push(root);
    await expect(
      new NexusImageGenerator().generate(
        {
          model: "fake/image-v1",
          operation_id: "image-operation-invalid",
          output: "image",
          output_directory: root,
          prompt: "Invalid bytes.",
          references: [],
          schema: "convax.generation-call/1",
        },
        () => ({
          async complete() {
            return {
              data: [
                {
                  b64_json: Buffer.from("not-an-image").toString("base64"),
                  media_type: "image/png",
                },
              ],
            };
          },
          isCurrent: () => true,
          maximumAgeMs: 60_000,
          models: [
            {
              id: "fake/image-v1",
              name: "Fake Image",
              outputModalities: ["image"],
            },
          ],
        }),
        new AbortController().signal,
      ),
    ).rejects.toThrow("do not match their media type");
    expect(await fs.readdir(root)).toEqual([]);
  });
});

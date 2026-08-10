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

describe("NexusImageGenerator", () => {
  test("validates the live image catalog and writes embedded image bytes once", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-image-"),
    );
    roots.push(root);
    let completions = 0;
    const generator = new NexusImageGenerator();
    const route = {
      isCurrent: () => true,
      maximumAgeMs: 60_000,
      models: [
        {
          id: "openai/gpt-image-1",
          name: "GPT Image 1",
          outputModalities: ["image", "text"],
        },
      ],
      complete: async (
        model: {
          id: string;
          name?: string;
          outputModalities: readonly string[];
        },
        _prompt: string,
        operationId: string,
      ) => {
        expect(model).toEqual({
          id: "openai/gpt-image-1",
          name: "GPT Image 1",
          outputModalities: ["image", "text"],
        });
        expect(operationId).toBe("operation-123");
        completions += 1;
        return {
          data: [
            {
              b64_json: png.toString("base64"),
              media_type: "image/png",
            },
          ],
        };
      },
    };
    const input = {
      model: "openai/gpt-image-1",
      operation_id: "operation-123",
      output: "image",
      output_directory: root,
      prompt: "Draw a small red circle.",
      references: [],
      schema: "convax.generation-call/1",
    };

    const first = await generator.generate(
      input,
      () => route,
      new AbortController().signal,
    );
    const second = await generator.generate(
      input,
      () => {
        throw new Error("A completed operation must not resolve a new route");
      },
      new AbortController().signal,
    );

    expect(completions).toBe(1);
    expect(second).toEqual(first);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      mimeType: "image/png",
      name: "nexus-operation-123-1.png",
      path: "nexus-operation-123-1.png",
    });
    expect(path.isAbsolute(first[0]!.path)).toBe(false);
    expect(await fs.readFile(path.join(root, first[0]!.path))).toEqual(png);
  });

  test("rejects a model that is no longer in the image-output catalog", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-image-"),
    );
    roots.push(root);
    let completions = 0;
    const generator = new NexusImageGenerator();
    const route = {
      isCurrent: () => true,
      maximumAgeMs: 60_000,
      models: [],
      complete: async () => {
        completions += 1;
        return {};
      },
    };

    await expect(
      generator.generate(
        {
          model: "openai/gpt-image-1",
          operation_id: "operation-456",
          output: "image",
          output_directory: root,
          prompt: "Draw a circle.",
          references: [],
          schema: "convax.generation-call/1",
        },
        () => route,
        new AbortController().signal,
      ),
    ).rejects.toThrow("unavailable");
    expect(completions).toBe(0);
  });
});

import { expect, test } from "bun:test";

import { imageGenerationTool, tools } from "../src/mcp-server.ts";

test("Nexus companion exposes image generation plus the fixed Service and LLM tools", () => {
  expect(tools.map(({ name }) => name)).toEqual([
    "image.generate",
    "service.status",
    "service.authorize",
    "service.reauthorize",
    "service.authorization.complete",
    "service.authorization.cancel",
    "service.sign_out",
    "service.checkout",
    "llm.models.list",
    "llm.gateway.start",
  ]);
});

test("Nexus image generation projects current image models as a bounded select", () => {
  const tool = imageGenerationTool([
    { id: "microsoft/mai-image-2.5-pro", name: "MAI Image 2.5 Pro" },
    { id: "openai/gpt-image-1", name: "GPT Image 1" },
  ]);
  expect(tool.inputSchema.properties.model).toEqual({
    oneOf: [
      {
        const: "microsoft/mai-image-2.5-pro",
        title: "MAI Image 2.5 Pro",
      },
      { const: "openai/gpt-image-1", title: "GPT Image 1" },
    ],
    title: "Model",
    type: "string",
  });
});

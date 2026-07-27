import { expect, test } from "bun:test";

import { tools } from "../src/mcp-server.ts";

test("Nexus companion exposes only the fixed Service, LLM catalog, and gateway tools", () => {
  expect(tools.map(({ name }) => name)).toEqual([
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

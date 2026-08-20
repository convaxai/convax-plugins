#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveAuthXPublicClientProfile } from "../src/authx-profile.ts";
import {
  generationLroAcknowledgementSchema,
  generationLroCapabilitySchema,
  generationLroRequestSchema,
  generationLroResultSchema,
  generationLroSnapshotSchema,
} from "../src/contracts.ts";

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(toolRoot, "../../..");
const pluginRoot = path.join(repositoryRoot, "packages/plugins/nexus-service");
const nexusProjectId = "project_8CTrOpIkozdhK7EkndKbR210ZU1NUYvW";

const [toolPackage, pluginPackage, pluginManifest] = await Promise.all([
  readJson(path.join(toolRoot, "package.json")),
  readJson(path.join(pluginRoot, "convax-package.json")),
  readJson(path.join(pluginRoot, "package/manifest.json")),
]);
const profile = await resolveAuthXPublicClientProfile({});

assertEqual(
  profile,
  {
    clientId: "oauthclient_Ty33MTkmTR6M90SCR1mvdUykHDJAHUnr",
    environment: "production",
    issuer: "https://authx.microvoid.io",
    jwksUri: "https://authx.microvoid.io/oauth/jwks.json",
    projectId: "project_OKnlkG5kU1lNrOqJs0GFTu4JM2SwNkHz",
    redirectUri: "http://127.0.0.1:65051/oauth/callback",
    scopes: ["openid", "profile", "email", "offline_access", "nexus:access"],
  },
  "production AuthX public-client profile",
);
if (profile.projectId === nexusProjectId) {
  throw new Error("Convax and Nexus AuthX Projects must remain distinct");
}

assertEqual(toolPackage.version, pluginPackage.version, "tool/package version");
assertEqual(pluginManifest.version, pluginPackage.version, "manifest/package version");
assertEqual(
  pluginPackage.companions,
  [
    {
      command: "convax-nexus-mcp",
      version: toolPackage.version,
      source: "packages/tools/nexus-mcp",
      targets: [
        {
          platform: "darwin",
          arch: "arm64",
          path: "dist/darwin-arm64/convax-nexus-mcp",
        },
      ],
    },
  ],
  "Nexus companion publication contract",
);

assertEqual(
  pluginManifest.contributes?.generation?.tools,
  [
    {
      id: "audio.generate",
      title: "Convax Audio",
      description:
        "Generate speech audio with a model discovered through the OpenRouter protocol.",
      output: "audio",
      acceptedInputs: [],
    },
    {
      id: "image.generate",
      title: "Convax Image",
      description:
        "Generate an image with a model discovered through the OpenRouter protocol.",
      output: "image",
      acceptedInputs: [],
    },
    {
      id: "video.generate",
      title: "Convax Video",
      description:
        "Generate a video with a model discovered through the OpenRouter protocol.",
      output: "video",
      acceptedInputs: [],
      recovery: {
        mode: "long-running-operation",
        schema: generationLroCapabilitySchema,
      },
    },
  ],
  "Nexus multimodal generation contract",
);
assertEqual(
  pluginManifest.contributes?.service?.actions,
  ["authorize", "reauthorize", "authorization.cancel", "checkout", "sign_out"],
  "Nexus service actions",
);
assertEqual(
  {
    acknowledgement: generationLroAcknowledgementSchema,
    capability: generationLroCapabilitySchema,
    request: generationLroRequestSchema,
    result: generationLroResultSchema,
    snapshot: generationLroSnapshotSchema,
  },
  {
    acknowledgement: "convax.generation-lro-acknowledgement/1",
    capability: "convax.generation-lro/1",
    request: "convax.generation-lro-request/1",
    result: "convax.generation-lro-result/1",
    snapshot: "convax.generation-lro-snapshot/1",
  },
  "generation LRO schemas",
);

console.log(
  JSON.stringify({
    authx: {
      clientId: profile.clientId,
      issuer: profile.issuer,
      redirectUri: profile.redirectUri,
      scopes: profile.scopes,
    },
    generation: ["audio", "image", "video"],
    pluginVersion: pluginPackage.version,
    status: "passed",
  }),
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} mismatch: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
  }
}

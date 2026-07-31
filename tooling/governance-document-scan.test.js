import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  currentPluginApiCatalogEvidence,
  hostCapabilityRequestFields,
  hostCapabilityRequestHeadings,
  validateHostCapabilityRequestDocument,
} from "./host-capability-request.mjs";
import { root } from "./lib.mjs";

const ignoredDirectories = new Set([
  ".git",
  "artifacts",
  "dist",
  "node_modules",
]);
const requestTemplatePath =
  "packages/skills/convax-plugin-authoring/package/references/host-capability-request.md";
const generatedSkillReferences = new Set([
  "convax-capabilities.md",
  "plugin-capabilities.md",
]);
const hostRepository =
  String.raw`(?:\.\./convax\b|/Users/[^\s'"\x60]+/convax\b|Convax Host repository|Host repository|Host repo|Host 仓库|Host 仓|宿主仓库|宿主仓)`;
const changeAction =
  String.raw`(?:edit|modify|change|implement|update|add|create|delete|remove|refactor|branch|commit|push|switch|open|submit)`;
const forbiddenInstructionPatterns = [
  new RegExp(String.raw`\b${changeAction}\b.{0,120}\b${hostRepository}`, "giu"),
  new RegExp(String.raw`\b${hostRepository}.{0,120}\b${changeAction}\b`, "giu"),
  /\b(?:open|create|submit|update)\b.{0,80}\b(?:Host(?: repository)?|Convax Host)\b.{0,40}\b(?:PR|pull request)\b/giu,
  /\b(?:push|commit)\b.{0,80}\b(?:Host (?:repository|repo|changes)|Convax Host|each repository|both repositories)\b/giu,
  new RegExp(
    String.raw`\b(?:cd|pushd|git\s+-C)\s+["'\x60]?(?:\.\./convax\b|/Users/[^\s'"\x60]+/convax\b)`,
    "giu",
  ),
  new RegExp(
    String.raw`\b(?:run|execute)\b.{0,80}\b(?:in|from)\b.{0,40}${hostRepository}`,
    "giu",
  ),
  /(?:修改|编辑|实现|新增|删除|重构|提交|推送|切换|进入|创建).{0,60}(?:Host\s*仓库?|宿主仓库?|convax\s*仓库?|Convax\s*仓库?)/gu,
  /(?:Host\s*仓库?|宿主仓库?|convax\s*仓库?|Convax\s*仓库?).{0,60}(?:修改|编辑|实现|新增|删除|重构|提交|推送|切换|进入|创建)/gu,
];
const nearbyNegation =
  /(?:\b(?:do not|does not authorize|must not|may not|never|cannot|can't|not authorized to|not (?:permission|authority) to|prohibited from|forbidden to)\b[^.!?]{0,120}|(?:禁止|不得|不要|不可|不能|无权|不授权)[^。！？]{0,100})$/iu;
const nearbyRejection =
  /^(?:[^.!?。！？]{0,80}\b(?:rejected|prohibited|forbidden|not allowed)\b|[^。！？]{0,60}(?:已拒绝|被拒绝|禁止|不允许))/iu;
const catalogHeaderTerms = [
  "api",
  "id",
  "since",
  "audience",
  "grant",
  "scope",
  "side effect",
  "availability",
];
const hostApiIdPattern =
  /\b(?:agent|canvas|generation|host|project)\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+\b/gu;
const copiedContractTerms = [
  /\bsince\b/iu,
  /\baudiences?\b/iu,
  /\bgrants?\b/iu,
  /\bscopes?\b/iu,
  /\bside effects?\b/iu,
  /\bavailability\b/iu,
  /\bcompletion\b/iu,
  /\bbounded (?:request|response)\b/iu,
  /\bstable errors?\b/iu,
  /\b(?:permission-denied|stale-context)\b/iu,
  /\b(?:request|response) schema\b/iu,
];
const copiedSchemaTerms = [
  /\badditionalProperties\b/u,
  /["']properties["']\s*:/u,
  /["']required["']\s*:/u,
  /\b(?:maxLength|maxItems|maxProperties|maxBytes)\b/u,
  /\b(?:oneOf|anyOf|allOf)\b/u,
  /["']type["']\s*:\s*["'](?:object|array|string|number|integer|boolean)["']/u,
];

async function markdownFiles(directory = root) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function relativePath(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function isNegated(block, index, length) {
  return (
    nearbyNegation.test(block.slice(Math.max(0, index - 160), index)) ||
    nearbyRejection.test(block.slice(index + length, index + length + 100))
  );
}

function forbiddenHostInstructions(source) {
  const violations = [];
  for (const paragraph of source.split(/\n\s*\n/gu)) {
    const block = paragraph.replace(/\s+/gu, " ").trim();
    if (!block) continue;
    for (const pattern of forbiddenInstructionPatterns) {
      pattern.lastIndex = 0;
      for (const match of block.matchAll(pattern)) {
        if (isNegated(block, match.index, match[0].length)) continue;
        violations.push(match[0]);
      }
    }
  }
  return [...new Set(violations)];
}

function sectionBody(source, heading) {
  const start = source.indexOf(heading);
  if (start < 0) return "";
  const contentStart = start + heading.length;
  const nextHeading = source.indexOf("\n## ", contentStart);
  return source.slice(
    contentStart,
    nextHeading < 0 ? source.length : nextHeading,
  );
}

function bulletFields(source) {
  return [...source.matchAll(/^- ([^:\n]+):(?:[ \t].*)?$/gmu)].map(
    (match) => match[1],
  );
}

function copiedCatalogViolations(source) {
  const violations = [];
  for (const line of source.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const normalized = line.toLowerCase();
    const matchedTerms = catalogHeaderTerms.filter((term) =>
      normalized.includes(term),
    );
    if (matchedTerms.length >= 3) {
      violations.push(`copied Catalog table header: ${line.trim()}`);
    }
  }
  const apiIds = new Set(source.match(hostApiIdPattern) ?? []);
  if (apiIds.size > 4) {
    violations.push(
      `lists ${apiIds.size} Host API ids instead of using generated references`,
    );
  }
  for (const paragraph of source.split(/\n\s*\n|(?=^\d+\.\s)/gmu)) {
    const paragraphApiIds = new Set(paragraph.match(hostApiIdPattern) ?? []);
    if (paragraphApiIds.size === 0) continue;
    const contractTerms = copiedContractTerms.filter((pattern) =>
      pattern.test(paragraph),
    );
    if (contractTerms.length >= 3) {
      violations.push(
        `copies contract metadata for ${[...paragraphApiIds].join(", ")}`,
      );
    }
  }
  for (const match of source.matchAll(hostApiIdPattern)) {
    const window = source.slice(
      Math.max(0, match.index - 160),
      Math.min(source.length, match.index + match[0].length + 640),
    );
    const schemaTerms = copiedSchemaTerms.filter((pattern) =>
      pattern.test(window),
    );
    if (schemaTerms.length >= 2) {
      violations.push(`copies schema for ${match[0]}`);
    }
  }
  return violations;
}

describe("repository document governance", () => {
  test("forbids executable cross-repository Host changes while allowing governance prose", async () => {
    expect(
      forbiddenHostInstructions(
        "Open the Convax Host pull request, then push both repositories.",
      ),
    ).not.toEqual([]);
    expect(
      forbiddenHostInstructions(
        "Run the root check in /Users/example/work/convax and commit the Host changes.",
      ),
    ).not.toEqual([]);
    expect(
      forbiddenHostInstructions(
        "Do not edit, branch, commit, push, or open a PR in the Host repository.",
      ),
    ).toEqual([]);
    expect(
      forbiddenHostInstructions(
        "Create a structured Host capability request here; explicit human approval starts a separate Host-owned task.",
      ),
    ).toEqual([]);

    const violations = [];
    for (const absolutePath of await markdownFiles()) {
      const source = await fs.readFile(absolutePath, "utf8");
      for (const instruction of forbiddenHostInstructions(source)) {
        violations.push(`${relativePath(absolutePath)}: ${instruction}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("keeps the mandatory Host request fields plus the protected decision audit", async () => {
    const source = await fs.readFile(
      path.join(root, requestTemplatePath),
      "utf8",
    );
    expect(source).toStartWith(
      "# Host capability request: <generic name>\n\nStatus: pending human review\n",
    );
    expect(source.match(/^## .+$/gmu)).toEqual(
      hostCapabilityRequestHeadings,
    );
    for (const heading of hostCapabilityRequestHeadings) {
      expect(bulletFields(sectionBody(source, heading))).toEqual(
        hostCapabilityRequestFields.get(heading) ?? [],
      );
    }
    expect(
      sectionBody(source, "## Falsifiable acceptance tests").match(
        /^\d+\. .+$/gmu,
      ),
    ).toHaveLength(3);
  });

  test("binds pending request evidence to the current canonical Host Catalog bytes", async () => {
    const { digest } = currentPluginApiCatalogEvidence();
    for (const request of [
      "docs/host-capability-requests/public-plugin-ui-foundation.md",
      "docs/host-capability-requests/sdk-owned-pet-surface-client.md",
      "docs/host-capability-requests/verified-companion-toolchain.md",
      "docs/host-capability-requests/web-plugin-image-input-read.md",
    ]) {
      expect(await fs.readFile(path.join(root, request), "utf8"))
        .toContain(`\`${digest}\``);
    }
  });

  test("validates every request against the canonical structure, decision audit, and fresh Catalog", async () => {
    const requestDirectory = path.join(
      root,
      "docs",
      "host-capability-requests",
    );
    const requestFiles = (await fs.readdir(requestDirectory))
      .filter((name) => name.endsWith(".md"))
      .sort();
    for (const name of requestFiles) {
      const source = await fs.readFile(
        path.join(requestDirectory, name),
        "utf8",
      );
      expect(() =>
        validateHostCapabilityRequestDocument(source, name),
      ).not.toThrow();
    }

    const source = await fs.readFile(
      path.join(requestDirectory, requestFiles[0]),
      "utf8",
    );
    expect(() =>
      validateHostCapabilityRequestDocument(
        source.replace(
          "## Requested generic contract",
          "## Requested Plugin-specific shortcut",
        ),
        "changed heading",
      ),
    ).toThrow("complete canonical section sequence");
    expect(() =>
      validateHostCapabilityRequestDocument(
        source.replace(/^- Stable errors:.*(?:\n {2,}.*)*/mu, ""),
        "missing field",
      ),
    ).toThrow("canonical required fields");
    expect(() =>
      validateHostCapabilityRequestDocument(
        source.replace("- Decision: pending", "- Decision: approved"),
        "self approval",
      ),
    ).toThrow("must remain exactly pending");
    expect(() =>
      validateHostCapabilityRequestDocument(
        source.replace(
          /\b[a-f0-9]{64}\b/u,
          "0".repeat(64),
        ),
        "stale catalog",
      ),
    ).toThrow("must bind @convax/plugin-api@");
    expect(() =>
      validateHostCapabilityRequestDocument(
        source.replace(
          /## Falsifiable acceptance tests[\s\S]*?\n## Plugin-side plan after approval/u,
          [
            "## Falsifiable acceptance tests",
            "",
            "1. Only one test.",
            "",
            "## Plugin-side plan after approval",
          ].join("\n"),
        ),
        "too few tests",
      ),
    ).toThrow("at least three falsifiable numbered tests");
  });

  test("keeps CONTRIBUTING on v8 and behind the current human gate", async () => {
    const source = await fs.readFile(
      path.join(root, "CONTRIBUTING.md"),
      "utf8",
    );
    for (const required of [
      "convax.package/2",
      "convax.plugin/8",
      "{name,path,uses?}",
      "docs/host-capability-requests/<kebab-case-slug>.md",
      "explicit human approval",
      "separate Host-owned task",
    ]) {
      expect(source).toContain(required);
    }
    expect(source).not.toContain("declare the v4");
  });

  test("prevents authored Skills and references from copying the Host API Catalog", async () => {
    expect(
      copiedCatalogViolations(
        "| API id | Since | Audience | Grant | Scope |\n| --- | --- | --- | --- | --- |",
      ),
    ).not.toEqual([]);
    expect(
      copiedCatalogViolations(
        "Call `host.context.get` before the workflow and handle unavailability.",
      ),
    ).toEqual([]);
    expect(
      copiedCatalogViolations(
        "`host.context.get` is available since 1.0.0 for the web-plugin audience with scope connection.",
      ),
    ).not.toEqual([]);
    expect(
      copiedCatalogViolations(
        [
          "### `host.context.get`",
          "",
          "```json",
          '{"type":"object","properties":{"scope":{"type":"string"}},"additionalProperties":false}',
          "```",
        ].join("\n"),
      ),
    ).not.toEqual([]);
    expect(
      copiedCatalogViolations(
        "Call `generation.tools.list`, then `generation.execute`; handle unavailable tools at runtime.",
      ),
    ).toEqual([]);

    const skillAuthoring = await fs.readFile(
      path.join(root, "docs", "skill-authoring.md"),
      "utf8",
    );
    for (const required of [
      "drift-prevention lint, not a security boundary",
      "reserved generated paths",
      "build-time injection",
      "snapshot digests",
    ]) {
      expect(skillAuthoring).toContain(required);
    }

    const violations = [];
    for (const absolutePath of await markdownFiles(
      path.join(root, "packages", "skills"),
    )) {
      const relative = relativePath(absolutePath);
      if (
        !relative.endsWith("/package/SKILL.md") &&
        !relative.includes("/package/references/")
      ) {
        continue;
      }
      if (generatedSkillReferences.has(path.basename(absolutePath))) continue;
      const source = await fs.readFile(absolutePath, "utf8");
      for (const violation of copiedCatalogViolations(source)) {
        violations.push(`${relative}: ${violation}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

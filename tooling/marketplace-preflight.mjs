import path from "node:path";
import { generateSkillApiReferences } from "./generate-skill-api-references.mjs";
import { root } from "./lib.mjs";
import { validateRepository } from "./validate.mjs";

export async function marketplacePreflight(options = {}) {
  if (!options.catalogPath) {
    throw new Error("Marketplace build requires --catalog");
  }
  const workspaceRoot = options.workspaceRoot ?? root;
  const referencePlan = await generateSkillApiReferences({
    catalogPath: path.resolve(workspaceRoot, options.catalogPath),
    check: true,
    workspaceRoot,
  });
  const validation = await validateRepository({ workspaceRoot });
  return {
    ...validation,
    catalogDigest: referencePlan.catalogDigest,
    catalogSchema: referencePlan.catalogSchema,
    catalogVersion: referencePlan.catalogVersion,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (
    args.length !== 2 ||
    args[0] !== "--catalog" ||
    !args[1] ||
    args[1].startsWith("--")
  ) {
    throw new Error("Usage: marketplace-preflight --catalog <plugin-api.json>");
  }
  const result = await marketplacePreflight({
    catalogPath: args[1],
    workspaceRoot: root,
  });
  console.log(
    `Admitted ${result.packages.length} Marketplace source packages against Host API catalog ${result.catalogVersion} (${result.catalogDigest}); ${result.blockedPackages.length} publication-blocked.`,
  );
  for (const pkg of result.blockedPackages) {
    console.log(
      `BLOCKED ${pkg.kind}/${pkg.id}@${pkg.version}: ${pkg.publication.blockers
        .map((blocker) => `${blocker.code}: ${blocker.note}`)
        .join("; ")}`,
    );
  }
}

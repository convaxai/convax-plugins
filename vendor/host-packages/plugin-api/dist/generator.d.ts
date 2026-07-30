import { type PluginApiCatalogSnapshot } from "./catalog-artifact";
import { type PluginApiCatalog } from "./contracts";
export type { PluginApiCatalogSnapshot, PluginApiContractSnapshot, PluginApiDefinitionSnapshot, } from "./catalog-artifact";
/**
 * A compatibility failure between two published Host API catalog snapshots.
 *
 * @public
 */
export interface PluginApiCompatibilityIssue {
    readonly kind: "invalid-version" | "api-added" | "api-removed" | "api-changed";
    readonly apiId?: string;
    readonly message: string;
}
/**
 * Filesystem locations used by the Host API artifact generator.
 *
 * @public
 */
export interface PluginApiGeneratorOptions {
    readonly outputDirectory: string;
    readonly historyDirectory: string;
    readonly check?: boolean;
}
/**
 * Result of generating or checking deterministic Host API artifacts.
 *
 * @public
 */
export interface PluginApiGeneratorResult {
    readonly changed: readonly string[];
    readonly checked: boolean;
}
type Snapshot = PluginApiCatalogSnapshot;
type CatalogInput = PluginApiCatalog | PluginApiCatalogSnapshot;
/**
 * Creates the normalized immutable data emitted to JSON and compatibility history.
 *
 * @public
 */
export declare function snapshotPluginApiCatalog(catalog?: CatalogInput): Snapshot;
/**
 * Renders the deterministic machine-readable Host API catalog.
 *
 * @public
 */
export declare function renderPluginApiJson(catalog?: CatalogInput): string;
/**
 * Renders the deterministic human-readable Host API catalog from structured metadata.
 *
 * @public
 */
export declare function renderPluginApiMarkdown(catalog?: CatalogInput): string;
/**
 * Compares two catalog snapshots using the package's conservative SemVer policy.
 *
 * @public
 */
export declare function checkPluginApiCompatibility(previousCatalog: CatalogInput, nextCatalog: CatalogInput): readonly PluginApiCompatibilityIssue[];
/**
 * Strictly parses one generated Catalog/history artifact, including every nested
 * wire schema and its digest. Authoring consumers must call this instead of
 * copying the artifact schema token or accepting shape-only JSON.
 *
 * @public
 */
export declare function parsePluginApiCatalogArtifact(value: unknown): PluginApiCatalogSnapshot;
/**
 * Generates or read-only checks the package JSON and Markdown artifacts.
 *
 * @public
 */
export declare function generatePluginApiArtifacts(options: PluginApiGeneratorOptions): Promise<PluginApiGeneratorResult>;
/**
 * Verifies that history contains an exact immutable snapshot for the current catalog.
 *
 * @public
 */
export declare function checkPluginApiHistory(historyDirectory: string): Promise<void>;
/**
 * Appends the current catalog snapshot after checking SemVer compatibility.
 *
 * @public
 */
export declare function appendPluginApiHistory(historyDirectory: string): Promise<string>;
//# sourceMappingURL=generator.d.ts.map
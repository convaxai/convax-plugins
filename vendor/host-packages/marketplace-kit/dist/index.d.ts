import { parseMcpServerExtension, parseRegistryV2, type ParsedServerPackage, type RegistryV2, type ShowcaseV2 } from "@convax/marketplace";
import { type PortablePluginManifestV8 } from "@convax/plugin-sdk";
import { type MarketplaceSelectionContext } from "./selective";
import { releaseTagForPackage } from "./release";
export type StarterKind = "plugin" | "skill" | "mcp-server";
export interface StarterOptions {
    id: string;
    name: string;
    owner: string;
    repository: string;
    starter: StarterKind;
}
export interface MarketplacePublishSelection {
    kind: StarterKind;
    id: string;
    version: string;
    previousVersion?: string;
    releaseTag: string;
}
export interface BuildMarketplaceOptions {
    root: string;
    outDir: string;
    official?: boolean;
    sequence?: number;
    previousDescriptorPath?: string;
    previousRegistryPath?: string;
    previousShowcasePath?: string;
    initialOfficial?: boolean;
    publishIdentities?: readonly string[];
    publishSelections?: readonly MarketplacePublishSelection[];
    fetchArtifact?: (artifact: {
        url: string;
        size: number;
        sha256: string;
    }) => Promise<Uint8Array>;
}
export interface MarketplaceBuildResult {
    registry: RegistryV2;
    registrySha256: string;
    showcase: ShowcaseV2;
    artifacts: Array<{
        path: string;
        size: number;
        sha256: string;
        releaseTag: string;
        url: string;
        kind: StarterKind;
        id: string;
        version: string;
    }>;
    releasePlan: {
        schema: "convax.release-plan/1";
        releases: Array<{
            tag: string;
            assets: Array<{
                path: string;
                name: string;
                size: number;
                sha256: string;
                url: string;
            }>;
        }>;
    };
    productLockInput: Record<string, unknown>;
    selectionContext?: MarketplaceSelectionContext;
}
interface DiscoveredPackage {
    kind: StarterKind;
    id: string;
    version: string;
    root: string;
    contentRoot: string;
    presentation: {
        name: string;
        description?: string;
    };
    authoring?: Record<string, unknown>;
    manifest?: PortablePluginManifestV8;
    server?: Record<string, unknown>;
    extension?: ReturnType<typeof parseMcpServerExtension>;
    catalogSupported?: boolean;
    mcpRuntime?: ParsedServerPackage["runtime"];
}
export declare function discoverMarketplacePackages(root: string): Promise<DiscoveredPackage[]>;
export declare function changedMarketplaceVersions(root: string, baseRevision: string): Promise<MarketplacePublishSelection[]>;
interface InventoryEntry {
    path: string;
    bytes: Uint8Array;
    mode: number;
}
export declare function createDeterministicZip(entriesValue: readonly InventoryEntry[]): Uint8Array;
export declare function checkMarketplace(root: string): Promise<void>;
export declare function buildMarketplace(options: BuildMarketplaceOptions): Promise<MarketplaceBuildResult>;
export declare function buildRegistryV2(options: BuildMarketplaceOptions): Promise<RegistryV2>;
export { parseRegistryV2, releaseTagForPackage };
export { MARKETPLACE_SELECTION_CONTEXT_SCHEMA, assertSelectiveMarketplaceClosure, packageIdentity, parseMarketplaceSelectionContext, parsePublishIdentities, } from "./selective";
export type { MarketplaceSelectionContext } from "./selective";
export declare function composeProductLockInput(options: {
    catalogDir: string;
    builtinDir: string;
    outFile: string;
}): Promise<Record<string, unknown>>;
export declare function buildBuiltinBundle(options: {
    root: string;
    outDir: string;
    releaseId?: string;
}): Promise<{
    schema: "convax.builtin-bundle/1";
    release: {
        id: string;
    };
    members: Array<{
        kind: StarterKind;
        id: string;
        version: string;
        artifact: {
            path: string;
            size: number;
            sha256: string;
        };
        presentation: {
            poster: {
                path: string;
                mime: string;
                size: number;
                sha256: string;
            };
            animation?: {
                path: string;
                mime: string;
                size: number;
                sha256: string;
            };
        };
    }>;
    archive: {
        path: string;
        size: number;
        sha256: string;
    };
}>;
export declare function createMarketplaceTemplate(root: string, kind: StarterKind, id: string): Promise<string>;
export declare function createMarketplaceStarter(root: string, options: StarterOptions): Promise<void>;
export declare function addMarketplaceDirectory(root: string, sourceDirectory: string): Promise<string>;
export declare function addTarget(root: string, mcpDirectory: string, options: {
    target: string;
    file: string;
}): Promise<string>;
//# sourceMappingURL=index.d.ts.map
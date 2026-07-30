import type { PluginApiSideEffect } from "@convax/plugin-api";
/** A stable, release-quality semantic version without prerelease/build suffixes. */
export type PluginCapabilityVersion = `${number}.${number}.${number}`;
/** An explicit half-open SemVer interval; arbitrary npm range syntax is intentionally unsupported. */
export interface PluginCapabilityVersionRange {
    readonly minimum: PluginCapabilityVersion;
    readonly maximumExclusive: PluginCapabilityVersion;
}
export type PluginCapabilitySchema = {
    readonly type: "null";
} | {
    readonly type: "boolean";
} | {
    readonly type: "number";
    readonly minimum?: number;
    readonly maximum?: number;
} | {
    readonly type: "integer";
    readonly minimum?: number;
    readonly maximum?: number;
} | {
    readonly type: "string";
    readonly minLength?: number;
    readonly maxLength: number;
    readonly enum?: readonly string[];
} | {
    readonly type: "array";
    readonly items: PluginCapabilitySchema;
    readonly minItems?: number;
    readonly maxItems: number;
} | PluginCapabilityObjectSchema;
export interface PluginCapabilityObjectSchema {
    readonly type: "object";
    readonly properties: Readonly<Record<string, PluginCapabilitySchema>>;
    readonly required: readonly string[];
    readonly additionalProperties: false;
}
export interface PluginCapabilityDocumentation {
    readonly summary: string;
    readonly request: string;
    readonly response: string;
    readonly remarks?: string;
}
export interface PluginCapabilityExport {
    readonly id: string;
    readonly version: PluginCapabilityVersion;
    /**
     * Exact MCP tool name exposed by the provider's verified mcp-stdio sidecar.
     * It is never an iframe callback, Agent alias, or Host method name.
     */
    readonly operation: string;
    readonly sideEffect: PluginApiSideEffect;
    readonly inputSchema: PluginCapabilityObjectSchema;
    readonly outputSchema: PluginCapabilityObjectSchema;
    readonly docs: PluginCapabilityDocumentation;
}
export interface PluginCapabilityImport {
    readonly id: string;
    /**
     * Caller-owned copy of the portable request contract. ActiveSet planning
     * requires it to match the selected provider export exactly.
     */
    readonly inputSchema: PluginCapabilityObjectSchema;
    /** Caller-owned copy of the portable response contract. */
    readonly outputSchema: PluginCapabilityObjectSchema;
    readonly version: PluginCapabilityVersionRange;
}
export interface PluginCapabilityDeclaration {
    readonly exports: readonly PluginCapabilityExport[];
    readonly imports: {
        readonly required: readonly PluginCapabilityImport[];
        readonly optional: readonly PluginCapabilityImport[];
    };
}
export type PluginCapabilityImportRequirement = "required" | "optional";
export type PluginCapabilityRuntimeUnavailableReason = "setup-required" | "disabled" | "recovering" | "contract-mismatch";
export type PluginCapabilityUnavailableReason = "not-declared" | "provider-missing" | "provider-incompatible" | "provider-ambiguous" | "self-provider" | "dependency-cycle" | PluginCapabilityRuntimeUnavailableReason;
export type PluginCapabilityAvailability<Provider = unknown> = {
    readonly available: true;
    readonly capabilityId: string;
    readonly requirement: PluginCapabilityImportRequirement;
    readonly provider: Provider;
    readonly version: PluginCapabilityVersion;
} | {
    readonly available: false;
    readonly capabilityId: string;
    readonly requirement?: PluginCapabilityImportRequirement;
    readonly reason: PluginCapabilityUnavailableReason;
    readonly recoverable: boolean;
};
export interface PluginCapabilityRuntimeToolDefinition {
    readonly inputSchema: unknown;
    readonly name: string;
    readonly outputSchema?: unknown;
}
export declare function isPluginCapabilityId(value: unknown): value is string;
export declare function isPluginCapabilityVersionCompatible(candidate: PluginCapabilityVersion, range: PluginCapabilityVersionRange): boolean;
/**
 * Parses the portable capability section embedded by the canonical Plugin manifest parser.
 * This function does not select providers or consult Host state.
 */
export declare function parsePluginCapabilityDeclaration(value: unknown): PluginCapabilityDeclaration;
/**
 * Provider selection is compatible only when the version and both portable
 * schemas match the caller import. A version match alone would let the Web
 * client and provider validate different contracts.
 */
export declare function isPluginCapabilityContractCompatible(imported: PluginCapabilityImport, exported: PluginCapabilityExport): boolean;
/**
 * Main-side ready gate for inter-Plugin exports.
 *
 * Call this with one complete `tools/list` result from the already verified
 * provider snapshot. Every declared export must resolve to one exact MCP tool,
 * and both closed schemas must normalize to the manifest schemas. Extra MCP
 * tools are allowed because the sidecar may also serve generation or service
 * contributions; they never become inter-Plugin operations implicitly.
 */
export declare function assertPluginCapabilityRuntimeTools(exports: readonly PluginCapabilityExport[], tools: readonly PluginCapabilityRuntimeToolDefinition[]): void;
/** Validates one request or response against the admitted bounded schema. */
export declare function assertPluginCapabilityValue(schema: PluginCapabilitySchema, value: unknown, label?: string): void;
/** Renders `references/plugin-capabilities.md` for a Plugin-owned Skill bundle. */
export declare function renderPluginCapabilityReference(declarationInput: PluginCapabilityDeclaration): string;
//# sourceMappingURL=capabilities.d.ts.map
/**
 * A strict semantic version used by the Host API catalog and its release ledger.
 *
 * @public
 */
export type PluginApiVersion = `${number}.${number}.${number}`;
/**
 * A runtime surface that may call a Host API.
 *
 * @public
 */
export type PluginApiAudience = "web-plugin" | "agent-skill" | "companion" | "host";
/**
 * The authority boundary within which a Host API operates.
 *
 * @public
 */
export type PluginApiScope = "connection" | "plugin" | "own-node" | "project" | "canvas";
/**
 * The externally observable effect category of a Host API call.
 *
 * @public
 */
export type PluginApiSideEffect = "none" | "read" | "write" | "execute" | "subscribe";
/**
 * Whether caller cancellation may discard a late result after execution began.
 * Commit-preserving APIs must still deliver the authoritative committed result.
 */
export type PluginApiCompletion = "cancelable" | "commit-preserving";
/**
 * Structured authoring documentation for a stable Host API error code.
 *
 * @public
 */
export interface PluginApiErrorDefinition {
    readonly code: string;
    readonly description: string;
    readonly recoverable: boolean;
}
/**
 * Structured documentation used to generate both human and Agent references.
 *
 * @public
 */
export interface PluginApiDocumentation {
    readonly summary: string;
    readonly description: string;
    readonly request: string;
    readonly response: string;
    readonly remarks?: string;
}
/**
 * One resolved Host API contract in the generated catalog.
 *
 * @public
 */
export interface PluginApiDefinition<Id extends string = string> {
    readonly id: Id;
    /**
     * Catalog version that first introduced this stable API id.
     *
     * This is identity lineage, not the minimum version that understands the
     * current request/result contract.
     */
    readonly since: PluginApiVersion;
    /**
     * Catalog release that introduced the currently published wire contract.
     *
     * A contract digest change advances this value to that exact release while
     * `since` remains immutable.
     */
    readonly contractSince: PluginApiVersion;
    readonly audience: readonly PluginApiAudience[];
    readonly completion: PluginApiCompletion;
    readonly grant: string | null;
    readonly scope: PluginApiScope;
    readonly sideEffect: PluginApiSideEffect;
    readonly errors: readonly PluginApiErrorDefinition[];
    readonly docs: PluginApiDocumentation;
}
/**
 * Authoring form of a Host API contract. `since` is assigned by its release block;
 * `contractSince` explicitly identifies the release that owns the current wire
 * contract.
 *
 * @public
 */
export type PluginApiDefinitionInput<Id extends string = string> = Omit<PluginApiDefinition<Id>, "since" | "audience"> & {
    readonly audience?: readonly PluginApiAudience[];
};
/**
 * A versioned group of newly introduced Host APIs.
 *
 * @public
 */
export interface PluginApiRelease<Version extends PluginApiVersion = PluginApiVersion, Definitions extends readonly PluginApiDefinitionInput[] = readonly PluginApiDefinitionInput[]> {
    readonly version: Version;
    readonly apis: Definitions;
}
/**
 * The immutable runtime representation of the Host API catalog.
 *
 * @public
 */
export interface PluginApiCatalog<Definition extends PluginApiDefinition = PluginApiDefinition> {
    readonly version: PluginApiVersion;
    readonly apis: readonly Definition[];
}
/**
 * A Plugin's declared compatibility and required/optional Host API set.
 *
 * @public
 */
export interface PluginApiDeclaration<Id extends string = string> {
    readonly major: number;
    readonly required: readonly Id[];
    readonly optional: readonly Id[];
}
/**
 * Why an API is unavailable for one live Plugin connection.
 *
 * @public
 */
export type PluginApiUnavailableReason = "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
/**
 * The structured, connection-scoped result of checking one Host API.
 *
 * @public
 */
export type ApiAvailability<Id extends string = string> = {
    readonly available: true;
    readonly id: Id;
    readonly since: PluginApiVersion;
    readonly contractSince: PluginApiVersion;
    readonly catalogVersion: PluginApiVersion;
} | {
    readonly available: false;
    readonly id: Id;
    readonly since?: PluginApiVersion;
    readonly contractSince?: PluginApiVersion;
    readonly reason: PluginApiUnavailableReason;
    readonly recoverable: boolean;
};
/**
 * Defines one statically typed Host API entry and validates its authoring metadata.
 *
 * @public
 */
export declare function definePluginApi<const Definition extends PluginApiDefinitionInput>(definition: Definition): Readonly<Definition & {
    audience: readonly PluginApiAudience[];
}>;
/**
 * Assigns a single introduction version to a group of new Host API definitions.
 *
 * @public
 */
export declare function definePluginApiRelease<const Version extends PluginApiVersion, const Definitions extends readonly PluginApiDefinitionInput[]>(version: Version, apis: Definitions): PluginApiRelease<Version, Definitions>;
export declare function definePluginApiRelease(version: PluginApiVersion, apis: readonly PluginApiDefinitionInput[]): PluginApiRelease;
type DefinitionFromRelease<Release> = Release extends PluginApiRelease<infer Version, infer Definitions> ? Definitions[number] extends infer Definition ? Definition extends PluginApiDefinitionInput ? Omit<Definition, "audience"> & {
    readonly audience: readonly PluginApiAudience[];
    readonly since: Version;
} : never : never : never;
/**
 * Builds an immutable catalog from strictly increasing, append-only release blocks.
 *
 * @public
 */
export declare function definePluginApiCatalog<const Releases extends readonly PluginApiRelease[]>(...releases: Releases): PluginApiCatalog<DefinitionFromRelease<Releases[number]>>;
export declare function definePluginApiCatalog(...releases: readonly PluginApiRelease[]): PluginApiCatalog;
export declare const pluginApiContractInternals: Readonly<{
    assertVersion: (value: string, label: string) => asserts value is PluginApiVersion;
    compareVersions: (left: PluginApiVersion, right: PluginApiVersion) => number;
}>;
export {};
//# sourceMappingURL=contracts.d.ts.map
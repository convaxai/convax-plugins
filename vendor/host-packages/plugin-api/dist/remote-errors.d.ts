import { pluginApiCatalog, type PluginApiId } from "./catalog";
type CatalogDefinition = (typeof pluginApiCatalog.apis)[number];
/** Stable error codes declared by one exact Host API Catalog entry. */
export type PluginApiErrorCode<Id extends PluginApiId = PluginApiId> = Extract<CatalogDefinition, {
    readonly id: Id;
}>["errors"][number]["code"];
/** Portable failure returned for one Host API request. */
export interface PluginApiRemoteFailure<Id extends PluginApiId = PluginApiId> {
    readonly code: PluginApiErrorCode<Id>;
    readonly kind: "api";
    readonly message: string;
    readonly recoverable: boolean;
}
export declare function isPluginApiErrorCode<Id extends PluginApiId>(id: Id, value: unknown): value is PluginApiErrorCode<Id>;
/**
 * Validates a Host failure against the exact API's Catalog error allowlist.
 * `recoverable` is metadata, not provider-controlled policy, and must match.
 */
export declare function parsePluginApiRemoteFailure<Id extends PluginApiId>(id: Id, value: unknown): PluginApiRemoteFailure<Id>;
export {};
//# sourceMappingURL=remote-errors.d.ts.map
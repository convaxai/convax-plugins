import { PLUGIN_API_CATALOG_MAJOR, type PluginApiId } from "./catalog";
import type { PluginApiDeclaration } from "./contracts";
/**
 * Defines and validates a typed required/optional Host API declaration.
 *
 * @public
 */
export declare function definePluginApiDeclaration<const Required extends readonly PluginApiId[], const Optional extends readonly PluginApiId[]>(declaration: {
    readonly major: typeof PLUGIN_API_CATALOG_MAJOR;
    readonly required: Required;
    readonly optional: Optional;
}): PluginApiDeclaration<Required[number] | Optional[number]>;
export declare function definePluginApiDeclaration(declaration: {
    readonly major: typeof PLUGIN_API_CATALOG_MAJOR;
    readonly required: readonly PluginApiId[];
    readonly optional: readonly PluginApiId[];
}): PluginApiDeclaration<PluginApiId>;
/**
 * Parses an authoring-time declaration and rejects unknown ids as likely typos.
 *
 * @public
 */
export declare function parsePluginApiDeclaration(value: unknown): PluginApiDeclaration<PluginApiId>;
/**
 * Parses a runtime declaration while preserving syntactically valid future API ids.
 *
 * @public
 */
export declare function parseRuntimePluginApiDeclaration(value: unknown): PluginApiDeclaration;
/**
 * Returns whether an API was declared as required, optional, or not declared.
 *
 * @public
 */
export declare function getPluginApiRequirement(declaration: PluginApiDeclaration, id: string): "required" | "optional" | undefined;
/**
 * Returns true only when the API is present in either declaration set.
 *
 * @public
 */
export declare function isPluginApiDeclared(declaration: PluginApiDeclaration, id: string): boolean;
//# sourceMappingURL=declaration.d.ts.map
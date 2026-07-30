import { type PluginApiId } from "./catalog";
/**
 * A concrete Plugin-owned tool description included beside Host APIs in a Skill reference.
 *
 * @public
 */
export interface PluginToolReference {
    readonly id: string;
    readonly summary: string;
    readonly request?: string;
    readonly response?: string;
}
/**
 * Input for the deterministic, filesystem-free Plugin-owned Skill API reference renderer.
 *
 * @public
 */
export interface PluginApiReferenceInput {
    readonly requiredIds: readonly PluginApiId[];
    readonly optionalIds: readonly PluginApiId[];
    readonly pluginTools?: readonly PluginToolReference[];
}
/**
 * Renders the generated Host API reference embedded in a Plugin-owned Skill bundle.
 *
 * @public
 */
export declare function renderPluginApiReference(input: PluginApiReferenceInput): string;
//# sourceMappingURL=reference.d.ts.map
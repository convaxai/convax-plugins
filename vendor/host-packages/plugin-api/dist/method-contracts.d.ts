import { type PluginApiCall, type PluginApiContractId, type PluginApiParams, type PluginApiResult, type PluginApiWireContract, type PluginApiWireSchema } from "./method-schemas";
export interface PluginApiObjectShape {
    readonly additionalProperties: false;
    readonly optional: readonly string[];
    readonly required: readonly string[];
    readonly type: "object";
}
export interface PluginApiNoParamsShape {
    readonly type: "none";
}
export interface PluginApiMethodContract {
    readonly request: PluginApiWireContract["request"];
    readonly params: PluginApiNoParamsShape | PluginApiObjectShape;
    readonly result: PluginApiObjectShape;
    readonly response: PluginApiWireContract["result"];
}
/**
 * Interprets the exact portable schema descriptor used by TypeScript, docs,
 * compatibility history, byte limits, and runtime Host boundaries.
 */
export declare function parsePluginApiSchema<Schema extends PluginApiWireSchema>(schema: Schema, value: unknown, label?: string): unknown;
export declare const pluginApiContractIds: readonly PluginApiContractId[];
export declare const pluginApiMethodContracts: Readonly<Record<PluginApiContractId, PluginApiMethodContract>>;
export declare function parsePluginApiParams<Id extends PluginApiContractId>(id: Id, value: unknown): PluginApiParams<Id>;
export declare function parsePluginApiResult<Id extends PluginApiContractId>(id: Id, value: unknown): PluginApiResult<Id>;
export declare function parsePluginApiCall(value: unknown): PluginApiCall;
export type { PluginApiCall, PluginApiContractId, PluginApiMethodMap, PluginApiParams, PluginApiResult, } from "./method-schemas";
//# sourceMappingURL=method-contracts.d.ts.map
import { type PluginApiId } from "./catalog";
import type { ApiAvailability, PluginApiAudience, PluginApiDeclaration, PluginApiVersion } from "./contracts";
/**
 * Live, connection-scoped facts consumed by the pure availability evaluator.
 *
 * @public
 */
export interface PluginApiLiveContext {
    readonly catalogVersion: PluginApiVersion;
    readonly catalogMajor: number;
    readonly audience: PluginApiAudience;
    readonly grants: readonly string[];
    readonly hasContext: boolean;
    readonly setupComplete: boolean;
    readonly disabled: boolean;
    readonly recovering: boolean;
}
/**
 * Evaluates Host API availability from already validated declaration and live facts.
 *
 * @public
 */
export declare function evaluatePluginApiAvailability(id: string, declaration: PluginApiDeclaration, context: PluginApiLiveContext): ApiAvailability;
/**
 * Error thrown when a caller requires an unavailable Host API.
 *
 * @public
 */
export declare class PluginApiUnavailableError<Id extends string = PluginApiId> extends Error {
    readonly availability: Extract<ApiAvailability<Id>, {
        available: false;
    }>;
    constructor(availability: Extract<ApiAvailability<Id>, {
        available: false;
    }>);
}
/**
 * Narrows an availability result to the available variant.
 *
 * @public
 */
export declare function isPluginApiAvailable<Id extends string>(availability: ApiAvailability<Id>): availability is Extract<ApiAvailability<Id>, {
    available: true;
}>;
/**
 * Returns the available result or throws a structured `PluginApiUnavailableError`.
 *
 * @public
 */
export declare function requirePluginApi<Id extends string>(availability: ApiAvailability<Id>): Extract<ApiAvailability<Id>, {
    available: true;
}>;
//# sourceMappingURL=availability.d.ts.map
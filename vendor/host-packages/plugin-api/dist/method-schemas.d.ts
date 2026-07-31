export type PluginApiStringRefinement = "lowercase-sha256" | "portable-project-relative-path" | "safe-png-file-name" | "trimmed";
export interface PluginApiWireProductConstraint<Field extends string = string> {
    readonly fields: readonly [Field, Field, ...Field[]];
    readonly maximum: number;
}
export type PluginApiWireSchema = {
    readonly type: "none";
} | {
    readonly type: "boolean";
} | {
    readonly const: boolean | number | string;
} | {
    readonly type: "integer" | "number";
    readonly finite: true;
    readonly maximum?: number;
    readonly minimum?: number;
} | {
    readonly type: "string";
    readonly controlCharacters: false;
    readonly enum?: readonly string[];
    readonly maxLength: number;
    readonly minLength: number;
    readonly prefix?: string;
    readonly refinement?: PluginApiStringRefinement;
} | {
    readonly type: "array";
    readonly items: PluginApiWireSchema;
    readonly maxItems: number;
    readonly minItems: number;
    readonly uniqueBy?: string;
} | {
    readonly additionalProperties: false;
    readonly properties: Readonly<Record<string, PluginApiWireSchema>>;
    readonly products?: readonly PluginApiWireProductConstraint[];
    readonly required: readonly string[];
    readonly type: "object";
} | {
    readonly keyMaxLength: number;
    readonly maxBytes: number;
    readonly maxDepth: number;
    readonly type: "json-object";
} | {
    readonly oneOf: readonly PluginApiWireSchema[];
} | {
    readonly type: "null";
};
export interface PluginApiWireLimit {
    readonly maxBytes: number;
    readonly schema: PluginApiWireSchema;
}
export interface PluginApiWireContract {
    readonly dialect: PluginApiWireSchemaDialect;
    readonly request: PluginApiWireLimit;
    readonly result: PluginApiWireLimit;
}
/** Wire-schema semantics admitted by the current runtime and generated Catalog. */
export declare const pluginApiWireSchemaDialect: "convax.plugin-api-wire-schema/3";
export type PluginApiWireSchemaDialect = typeof pluginApiWireSchemaDialect;
declare const pluginApiSchemaValue: unique symbol;
interface PluginApiSchemaBrand<Value> {
    readonly [pluginApiSchemaValue]: Value;
}
export type PluginApiJsonValue = null | boolean | number | string | readonly PluginApiJsonValue[] | {
    readonly [key: string]: PluginApiJsonValue;
};
export declare const maximumPluginApiConnectedImageBytes: number;
export declare const maximumPluginApiConnectedImageDimension = 8192;
export declare const maximumPluginApiConnectedImagePixels = 33554432;
/**
 * Complete portable wire schemas and byte budgets for every Host API.
 *
 * These values are serialized into the generated Catalog and immutable history.
 * Runtime parsers in `method-contracts.ts` enforce the same closed contract.
 */
export declare const pluginApiWireContracts: Readonly<{
    readonly "host.context.get": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly type: "none";
            } & PluginApiSchemaBrand<undefined>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly canvas: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly id: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly name: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: readonly PluginApiWireProductConstraint<"id" | "name">[] | undefined;
                        readonly required: readonly ["id"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly id: string;
                    } & {
                        readonly name?: string | undefined;
                    }>;
                    readonly hostApi: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly availability: {
                                readonly items: {
                                    readonly oneOf: readonly [{
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly available: {
                                                readonly const: true;
                                            } & PluginApiSchemaBrand<true>;
                                            readonly catalogVersion: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly contractSince: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly id: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly since: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly ["available", "catalogVersion", "contractSince", "id", "since"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly since: string;
                                        readonly id: string;
                                        readonly contractSince: string;
                                        readonly available: true;
                                        readonly catalogVersion: string;
                                    } & {}>, {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly available: {
                                                readonly const: false;
                                            } & PluginApiSchemaBrand<false>;
                                            readonly contractSince: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly id: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly reason: {
                                                readonly controlCharacters: false;
                                                readonly enum: readonly ["unsupported-host", "not-declared", "permission-denied", "wrong-surface", "missing-context", "setup-required", "disabled", "recovering"];
                                                readonly maxLength: number;
                                                readonly minLength: 1;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<"unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering">;
                                            readonly recoverable: {
                                                readonly type: "boolean";
                                            } & PluginApiSchemaBrand<boolean>;
                                            readonly since: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly ["available", "id", "reason", "recoverable"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly id: string;
                                        readonly recoverable: boolean;
                                        readonly available: false;
                                        readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                                    } & {
                                        readonly since?: string | undefined;
                                        readonly contractSince?: string | undefined;
                                    }>];
                                } & PluginApiSchemaBrand<({
                                    readonly since: string;
                                    readonly id: string;
                                    readonly contractSince: string;
                                    readonly available: true;
                                    readonly catalogVersion: string;
                                } & {}) | ({
                                    readonly id: string;
                                    readonly recoverable: boolean;
                                    readonly available: false;
                                    readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                                } & {
                                    readonly since?: string | undefined;
                                    readonly contractSince?: string | undefined;
                                })>;
                                readonly maxItems: number;
                                readonly minItems: number;
                                readonly type: "array";
                                readonly uniqueBy?: string;
                            } & PluginApiSchemaBrand<readonly (({
                                readonly since: string;
                                readonly id: string;
                                readonly contractSince: string;
                                readonly available: true;
                                readonly catalogVersion: string;
                            } & {}) | ({
                                readonly id: string;
                                readonly recoverable: boolean;
                                readonly available: false;
                                readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                            } & {
                                readonly since?: string | undefined;
                                readonly contractSince?: string | undefined;
                            }))[]>;
                            readonly catalogVersion: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: readonly PluginApiWireProductConstraint<"catalogVersion" | "availability">[] | undefined;
                        readonly required: readonly ["availability", "catalogVersion"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly catalogVersion: string;
                        readonly availability: readonly (({
                            readonly since: string;
                            readonly id: string;
                            readonly contractSince: string;
                            readonly available: true;
                            readonly catalogVersion: string;
                        } & {}) | ({
                            readonly id: string;
                            readonly recoverable: boolean;
                            readonly available: false;
                            readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                        } & {
                            readonly since?: string | undefined;
                            readonly contractSince?: string | undefined;
                        }))[];
                    } & {}>;
                    readonly node: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly data: {
                                readonly keyMaxLength: 128;
                                readonly maxBytes: number;
                                readonly maxDepth: 32;
                                readonly type: "json-object";
                            } & PluginApiSchemaBrand<Readonly<Record<string, PluginApiJsonValue>>>;
                            readonly id: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly parentId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly position: {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly x: {
                                        readonly finite: true;
                                        readonly type: "number";
                                    } & PluginApiSchemaBrand<number>;
                                    readonly y: {
                                        readonly finite: true;
                                        readonly type: "number";
                                    } & PluginApiSchemaBrand<number>;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["x", "y"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly x: number;
                                readonly y: number;
                            } & {}>;
                            readonly revision: {
                                readonly finite: true;
                                readonly minimum: 0;
                                readonly type: "integer";
                            } & PluginApiSchemaBrand<number>;
                            readonly style: {
                                readonly keyMaxLength: 128;
                                readonly maxBytes: number;
                                readonly maxDepth: 32;
                                readonly type: "json-object";
                            } & PluginApiSchemaBrand<Readonly<Record<string, PluginApiJsonValue>>>;
                            readonly type: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: undefined;
                        readonly required: readonly ["data", "id", "position", "revision", "type"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly id: string;
                        readonly type: string;
                        readonly data: Readonly<Record<string, PluginApiJsonValue>>;
                        readonly position: {
                            readonly x: number;
                            readonly y: number;
                        } & {};
                        readonly revision: number;
                    } & {
                        readonly parentId?: string | undefined;
                        readonly style?: Readonly<Record<string, PluginApiJsonValue>> | undefined;
                    }>;
                    readonly plugin: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly id: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly name: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly version: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: readonly PluginApiWireProductConstraint<"id" | "version" | "name">[] | undefined;
                        readonly required: readonly ["id", "name", "version"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly id: string;
                        readonly version: string;
                        readonly name: string;
                    } & {}>;
                    readonly project: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly id: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly name: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: readonly PluginApiWireProductConstraint<"id" | "name">[] | undefined;
                        readonly required: readonly ["id"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly id: string;
                    } & {
                        readonly name?: string | undefined;
                    }>;
                };
                readonly products?: undefined;
                readonly required: readonly ["canvas", "hostApi", "node", "plugin", "project"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly plugin: {
                    readonly id: string;
                    readonly version: string;
                    readonly name: string;
                } & {};
                readonly project: {
                    readonly id: string;
                } & {
                    readonly name?: string | undefined;
                };
                readonly canvas: {
                    readonly id: string;
                } & {
                    readonly name?: string | undefined;
                };
                readonly hostApi: {
                    readonly catalogVersion: string;
                    readonly availability: readonly (({
                        readonly since: string;
                        readonly id: string;
                        readonly contractSince: string;
                        readonly available: true;
                        readonly catalogVersion: string;
                    } & {}) | ({
                        readonly id: string;
                        readonly recoverable: boolean;
                        readonly available: false;
                        readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                    } & {
                        readonly since?: string | undefined;
                        readonly contractSince?: string | undefined;
                    }))[];
                } & {};
                readonly node: {
                    readonly id: string;
                    readonly type: string;
                    readonly data: Readonly<Record<string, PluginApiJsonValue>>;
                    readonly position: {
                        readonly x: number;
                        readonly y: number;
                    } & {};
                    readonly revision: number;
                } & {
                    readonly parentId?: string | undefined;
                    readonly style?: Readonly<Record<string, PluginApiJsonValue>> | undefined;
                };
            } & {}>;
        };
    };
    readonly "canvas.inputs.list": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly type: "none";
            } & PluginApiSchemaBrand<undefined>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly inputs: {
                        readonly items: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly durationMs: {
                                    readonly finite: true;
                                    readonly type: "number";
                                } & PluginApiSchemaBrand<number>;
                                readonly height: {
                                    readonly finite: true;
                                    readonly type: "number";
                                } & PluginApiSchemaBrand<number>;
                                readonly inputKey: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly kind: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly label: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly mediaRevision: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly mimeType: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly name: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly status: {
                                    readonly controlCharacters: false;
                                    readonly enum: readonly ["error", "idle", "pending"];
                                    readonly maxLength: number;
                                    readonly minLength: 1;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<"error" | "idle" | "pending">;
                                readonly width: {
                                    readonly finite: true;
                                    readonly type: "number";
                                } & PluginApiSchemaBrand<number>;
                            };
                            readonly products?: undefined;
                            readonly required: readonly ["inputKey", "kind", "label"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly inputKey: string;
                            readonly label: string;
                            readonly kind: string;
                        } & {
                            readonly height?: number | undefined;
                            readonly width?: number | undefined;
                            readonly status?: "error" | "idle" | "pending" | undefined;
                            readonly durationMs?: number | undefined;
                            readonly mediaRevision?: string | undefined;
                            readonly mimeType?: string | undefined;
                            readonly name?: string | undefined;
                        }>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly ({
                        readonly inputKey: string;
                        readonly label: string;
                        readonly kind: string;
                    } & {
                        readonly height?: number | undefined;
                        readonly width?: number | undefined;
                        readonly status?: "error" | "idle" | "pending" | undefined;
                        readonly durationMs?: number | undefined;
                        readonly mediaRevision?: string | undefined;
                        readonly mimeType?: string | undefined;
                        readonly name?: string | undefined;
                    })[]>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"inputs">[] | undefined;
                readonly required: readonly ["inputs"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly inputs: readonly ({
                    readonly inputKey: string;
                    readonly label: string;
                    readonly kind: string;
                } & {
                    readonly height?: number | undefined;
                    readonly width?: number | undefined;
                    readonly status?: "error" | "idle" | "pending" | undefined;
                    readonly durationMs?: number | undefined;
                    readonly mediaRevision?: string | undefined;
                    readonly mimeType?: string | undefined;
                    readonly name?: string | undefined;
                })[];
            } & {}>;
        };
    };
    readonly "canvas.inputs.image.open": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly inputKey: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"inputKey">[] | undefined;
                readonly required: readonly ["inputKey"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly inputKey: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly probe: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly contentRevision: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly height: {
                                readonly finite: true;
                                readonly maximum: 8192;
                                readonly minimum: 1;
                                readonly type: "integer";
                            } & PluginApiSchemaBrand<number>;
                            readonly kind: {
                                readonly const: "image";
                            } & PluginApiSchemaBrand<"image">;
                            readonly mimeType: {
                                readonly controlCharacters: false;
                                readonly enum: readonly ["image/jpeg", "image/png", "image/webp"];
                                readonly maxLength: number;
                                readonly minLength: 1;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<"image/jpeg" | "image/png" | "image/webp">;
                            readonly size: {
                                readonly finite: true;
                                readonly maximum: number;
                                readonly minimum: 1;
                                readonly type: "integer";
                            } & PluginApiSchemaBrand<number>;
                            readonly width: {
                                readonly finite: true;
                                readonly maximum: 8192;
                                readonly minimum: 1;
                                readonly type: "integer";
                            } & PluginApiSchemaBrand<number>;
                        };
                        readonly products?: readonly [{
                            readonly fields: readonly ["width", "height"];
                            readonly maximum: 33554432;
                        }] | undefined;
                        readonly required: readonly ["contentRevision", "height", "kind", "mimeType", "size", "width"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly height: number;
                        readonly width: number;
                        readonly size: number;
                        readonly kind: "image";
                        readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
                        readonly contentRevision: string;
                    } & {}>;
                    readonly sessionId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly url: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"probe" | "sessionId" | "url">[] | undefined;
                readonly required: readonly ["probe", "sessionId", "url"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly probe: {
                    readonly height: number;
                    readonly width: number;
                    readonly size: number;
                    readonly kind: "image";
                    readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
                    readonly contentRevision: string;
                } & {};
                readonly sessionId: string;
                readonly url: string;
            } & {}>;
        };
    };
    readonly "canvas.inputs.image.close": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly sessionId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"sessionId">[] | undefined;
                readonly required: readonly ["sessionId"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly sessionId: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly closed: {
                        readonly type: "boolean";
                    } & PluginApiSchemaBrand<boolean>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"closed">[] | undefined;
                readonly required: readonly ["closed"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly closed: boolean;
            } & {}>;
        };
    };
    readonly "canvas.inputs.open": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly inputKey: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"inputKey">[] | undefined;
                readonly required: readonly ["inputKey"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly inputKey: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly probe: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly duration: {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly estimated: {
                                        readonly type: "boolean";
                                    } & PluginApiSchemaBrand<boolean>;
                                    readonly milliseconds: {
                                        readonly finite: true;
                                        readonly type: "number";
                                    } & PluginApiSchemaBrand<number>;
                                };
                                readonly products?: readonly PluginApiWireProductConstraint<"estimated" | "milliseconds">[] | undefined;
                                readonly required: readonly ["estimated", "milliseconds"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly estimated: boolean;
                                readonly milliseconds: number;
                            } & {}>;
                            readonly height: {
                                readonly finite: true;
                                readonly type: "number";
                            } & PluginApiSchemaBrand<number>;
                            readonly kind: {
                                readonly controlCharacters: false;
                                readonly enum: readonly ["audio", "video"];
                                readonly maxLength: number;
                                readonly minLength: 1;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<"video" | "audio">;
                            readonly mediaRevision: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly mimeType: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly size: {
                                readonly finite: true;
                                readonly type: "number";
                            } & PluginApiSchemaBrand<number>;
                            readonly width: {
                                readonly finite: true;
                                readonly type: "number";
                            } & PluginApiSchemaBrand<number>;
                        };
                        readonly products?: readonly PluginApiWireProductConstraint<"height" | "width" | "size" | "kind" | "mediaRevision" | "mimeType" | "duration">[] | undefined;
                        readonly required: readonly ["duration", "kind", "mediaRevision", "mimeType", "size"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly size: number;
                        readonly kind: "video" | "audio";
                        readonly mediaRevision: string;
                        readonly mimeType: string;
                        readonly duration: {
                            readonly estimated: boolean;
                            readonly milliseconds: number;
                        } & {};
                    } & {
                        readonly height?: number | undefined;
                        readonly width?: number | undefined;
                    }>;
                    readonly sessionId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly url: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"probe" | "sessionId" | "url">[] | undefined;
                readonly required: readonly ["probe", "sessionId", "url"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly probe: {
                    readonly size: number;
                    readonly kind: "video" | "audio";
                    readonly mediaRevision: string;
                    readonly mimeType: string;
                    readonly duration: {
                        readonly estimated: boolean;
                        readonly milliseconds: number;
                    } & {};
                } & {
                    readonly height?: number | undefined;
                    readonly width?: number | undefined;
                };
                readonly sessionId: string;
                readonly url: string;
            } & {}>;
        };
    };
    readonly "canvas.inputs.close": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly sessionId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"sessionId">[] | undefined;
                readonly required: readonly ["sessionId"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly sessionId: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly closed: {
                        readonly type: "boolean";
                    } & PluginApiSchemaBrand<boolean>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"closed">[] | undefined;
                readonly required: readonly ["closed"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly closed: boolean;
            } & {}>;
        };
    };
    readonly "canvas.node.get": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly type: "none";
            } & PluginApiSchemaBrand<undefined>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly data: {
                        readonly keyMaxLength: 128;
                        readonly maxBytes: number;
                        readonly maxDepth: 32;
                        readonly type: "json-object";
                    } & PluginApiSchemaBrand<Readonly<Record<string, PluginApiJsonValue>>>;
                    readonly id: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly parentId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly position: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly x: {
                                readonly finite: true;
                                readonly type: "number";
                            } & PluginApiSchemaBrand<number>;
                            readonly y: {
                                readonly finite: true;
                                readonly type: "number";
                            } & PluginApiSchemaBrand<number>;
                        };
                        readonly products?: undefined;
                        readonly required: readonly ["x", "y"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly x: number;
                        readonly y: number;
                    } & {}>;
                    readonly revision: {
                        readonly finite: true;
                        readonly minimum: 0;
                        readonly type: "integer";
                    } & PluginApiSchemaBrand<number>;
                    readonly style: {
                        readonly keyMaxLength: 128;
                        readonly maxBytes: number;
                        readonly maxDepth: 32;
                        readonly type: "json-object";
                    } & PluginApiSchemaBrand<Readonly<Record<string, PluginApiJsonValue>>>;
                    readonly type: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: undefined;
                readonly required: readonly ["data", "id", "position", "revision", "type"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly id: string;
                readonly type: string;
                readonly data: Readonly<Record<string, PluginApiJsonValue>>;
                readonly position: {
                    readonly x: number;
                    readonly y: number;
                } & {};
                readonly revision: number;
            } & {
                readonly parentId?: string | undefined;
                readonly style?: Readonly<Record<string, PluginApiJsonValue>> | undefined;
            }>;
        };
    };
    readonly "canvas.node.state.replace": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly state: {
                        readonly keyMaxLength: 128;
                        readonly maxBytes: number;
                        readonly maxDepth: 32;
                        readonly type: "json-object";
                    } & PluginApiSchemaBrand<Readonly<Record<string, PluginApiJsonValue>>>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"state">[] | undefined;
                readonly required: readonly ["state"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly state: Readonly<Record<string, PluginApiJsonValue>>;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly updated: {
                        readonly const: true;
                    } & PluginApiSchemaBrand<true>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"updated">[] | undefined;
                readonly required: readonly ["updated"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly updated: true;
            } & {}>;
        };
    };
    readonly "canvas.resource.image.create": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly dataUrl: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly name: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"name" | "dataUrl">[] | undefined;
                readonly required: readonly ["dataUrl", "name"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly name: string;
                readonly dataUrl: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly createdNodeId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly revision: {
                        readonly finite: true;
                        readonly minimum: 0;
                        readonly type: "integer";
                    } & PluginApiSchemaBrand<number>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"revision" | "createdNodeId">[] | undefined;
                readonly required: readonly ["createdNodeId", "revision"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly revision: number;
                readonly createdNodeId: string;
            } & {}>;
        };
    };
    readonly "project.file.text.read": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly path: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"path">[] | undefined;
                readonly required: readonly ["path"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly path: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly content: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly exists: {
                        readonly type: "boolean";
                    } & PluginApiSchemaBrand<boolean>;
                    readonly path: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"path" | "content" | "exists">[] | undefined;
                readonly required: readonly ["content", "exists", "path"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly path: string;
                readonly content: string;
                readonly exists: boolean;
            } & {}>;
        };
    };
    readonly "agent.prompt": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly text: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"text">[] | undefined;
                readonly required: readonly ["text"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly text: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly text: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"text">[] | undefined;
                readonly required: readonly ["text"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly text: string;
            } & {}>;
        };
    };
    readonly "generation.tools.list": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly oneOf: readonly [{
                    readonly type: "none";
                } & PluginApiSchemaBrand<undefined>, {
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly output: {
                            readonly controlCharacters: false;
                            readonly enum: readonly ["text", "image", "video", "audio"];
                            readonly maxLength: number;
                            readonly minLength: 1;
                            readonly type: "string";
                        } & PluginApiSchemaBrand<"text" | "image" | "video" | "audio">;
                    };
                    readonly products?: readonly PluginApiWireProductConstraint<"output">[] | undefined;
                    readonly required: readonly [];
                    readonly type: "object";
                } & PluginApiSchemaBrand<{} & {
                    readonly output?: "text" | "image" | "video" | "audio" | undefined;
                }>];
            } & PluginApiSchemaBrand<({} & {
                readonly output?: "text" | "image" | "video" | "audio" | undefined;
            }) | undefined>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly tools: {
                        readonly items: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly acceptedInputs: {
                                    readonly items: {
                                        readonly controlCharacters: false;
                                        readonly enum: readonly ["text", "reference_image", "reference_video", "first_frame", "last_frame", "audio"];
                                        readonly maxLength: number;
                                        readonly minLength: 1;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<"text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame">;
                                    readonly maxItems: number;
                                    readonly minItems: number;
                                    readonly type: "array";
                                    readonly uniqueBy?: string;
                                } & PluginApiSchemaBrand<readonly ("text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame")[]>;
                                readonly description: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly id: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly kind: {
                                    readonly controlCharacters: false;
                                    readonly enum: readonly ["model", "operation"];
                                    readonly maxLength: number;
                                    readonly minLength: 1;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<"model" | "operation">;
                                readonly output: {
                                    readonly controlCharacters: false;
                                    readonly enum: readonly ["text", "image", "video", "audio"];
                                    readonly maxLength: number;
                                    readonly minLength: 1;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<"text" | "image" | "video" | "audio">;
                                readonly title: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                            };
                            readonly products?: undefined;
                            readonly required: readonly ["acceptedInputs", "description", "id", "kind", "output", "title"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly id: string;
                            readonly description: string;
                            readonly kind: "model" | "operation";
                            readonly acceptedInputs: readonly ("text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame")[];
                            readonly output: "text" | "image" | "video" | "audio";
                            readonly title: string;
                        } & {}>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly ({
                        readonly id: string;
                        readonly description: string;
                        readonly kind: "model" | "operation";
                        readonly acceptedInputs: readonly ("text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame")[];
                        readonly output: "text" | "image" | "video" | "audio";
                        readonly title: string;
                    } & {})[]>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"tools">[] | undefined;
                readonly required: readonly ["tools"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly tools: readonly ({
                    readonly id: string;
                    readonly description: string;
                    readonly kind: "model" | "operation";
                    readonly acceptedInputs: readonly ("text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame")[];
                    readonly output: "text" | "image" | "video" | "audio";
                    readonly title: string;
                } & {})[];
            } & {}>;
        };
    };
    readonly "generation.execute": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly output: {
                        readonly controlCharacters: false;
                        readonly enum: readonly ["text", "image", "video", "audio"];
                        readonly maxLength: number;
                        readonly minLength: 1;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<"text" | "image" | "video" | "audio">;
                    readonly prompt: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly references: {
                        readonly items: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly inputKey: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly role: {
                                    readonly controlCharacters: false;
                                    readonly enum: readonly ["text", "reference_image", "reference_video", "first_frame", "last_frame", "audio"];
                                    readonly maxLength: number;
                                    readonly minLength: 1;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<"text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame">;
                            };
                            readonly products?: undefined;
                            readonly required: readonly ["inputKey", "role"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly inputKey: string;
                            readonly role: "text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame";
                        } & {}>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly ({
                        readonly inputKey: string;
                        readonly role: "text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame";
                    } & {})[]>;
                    readonly resultMode: {
                        readonly controlCharacters: false;
                        readonly enum: readonly ["create-pending-node", "return"];
                        readonly maxLength: number;
                        readonly minLength: 1;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<"create-pending-node" | "return">;
                    readonly toolId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"output" | "references" | "resultMode" | "prompt" | "toolId">[] | undefined;
                readonly required: readonly ["prompt"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly prompt: string;
            } & {
                readonly output?: "text" | "image" | "video" | "audio" | undefined;
                readonly references?: readonly ({
                    readonly inputKey: string;
                    readonly role: "text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame";
                } & {})[] | undefined;
                readonly resultMode?: "create-pending-node" | "return" | undefined;
                readonly toolId?: string | undefined;
            }>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly createdNodeIds: {
                        readonly items: {
                            readonly controlCharacters: false;
                            readonly maxLength: number;
                            readonly minLength: number;
                            readonly prefix?: string;
                            readonly refinement?: PluginApiStringRefinement;
                            readonly type: "string";
                        } & PluginApiSchemaBrand<string>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly string[]>;
                    readonly outputText: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly revision: {
                        readonly finite: true;
                        readonly minimum: 0;
                        readonly type: "integer";
                    } & PluginApiSchemaBrand<number>;
                    readonly toolId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly warnings: {
                        readonly items: {
                            readonly controlCharacters: false;
                            readonly maxLength: number;
                            readonly minLength: number;
                            readonly prefix?: string;
                            readonly refinement?: PluginApiStringRefinement;
                            readonly type: "string";
                        } & PluginApiSchemaBrand<string>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly string[]>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"revision" | "toolId" | "createdNodeIds" | "warnings" | "outputText">[] | undefined;
                readonly required: readonly ["createdNodeIds", "revision", "toolId", "warnings"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly revision: number;
                readonly toolId: string;
                readonly createdNodeIds: readonly string[];
                readonly warnings: readonly string[];
            } & {
                readonly outputText?: string | undefined;
            }>;
        };
    };
    readonly "projects.list": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly type: "none";
            } & PluginApiSchemaBrand<undefined>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly projects: {
                        readonly items: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly available: {
                                    readonly type: "boolean";
                                } & PluginApiSchemaBrand<boolean>;
                                readonly id: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly name: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                            };
                            readonly products?: readonly PluginApiWireProductConstraint<"id" | "available" | "name">[] | undefined;
                            readonly required: readonly ["available", "id", "name"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly id: string;
                            readonly available: boolean;
                            readonly name: string;
                        } & {}>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly ({
                        readonly id: string;
                        readonly available: boolean;
                        readonly name: string;
                    } & {})[]>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"projects">[] | undefined;
                readonly required: readonly ["projects"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly projects: readonly ({
                    readonly id: string;
                    readonly available: boolean;
                    readonly name: string;
                } & {})[];
            } & {}>;
        };
    };
    readonly "canvas.catalog.list": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly projectId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"projectId">[] | undefined;
                readonly required: readonly ["projectId"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly projectId: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly canvases: {
                        readonly items: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly createdAt: {
                                    readonly finite: true;
                                    readonly type: "number";
                                } & PluginApiSchemaBrand<number>;
                                readonly id: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly name: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly updatedAt: {
                                    readonly finite: true;
                                    readonly type: "number";
                                } & PluginApiSchemaBrand<number>;
                            };
                            readonly products?: readonly PluginApiWireProductConstraint<"id" | "name" | "createdAt" | "updatedAt">[] | undefined;
                            readonly required: readonly ["createdAt", "id", "name", "updatedAt"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly id: string;
                            readonly name: string;
                            readonly createdAt: number;
                            readonly updatedAt: number;
                        } & {}>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly ({
                        readonly id: string;
                        readonly name: string;
                        readonly createdAt: number;
                        readonly updatedAt: number;
                    } & {})[]>;
                    readonly projectId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"projectId" | "canvases">[] | undefined;
                readonly required: readonly ["canvases", "projectId"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly projectId: string;
                readonly canvases: readonly ({
                    readonly id: string;
                    readonly name: string;
                    readonly createdAt: number;
                    readonly updatedAt: number;
                } & {})[];
            } & {}>;
        };
    };
    readonly "canvas.document.get": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly projection: {
                        readonly controlCharacters: false;
                        readonly enum: readonly ["geometry", "structure"];
                        readonly maxLength: number;
                        readonly minLength: 1;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<"geometry" | "structure">;
                    readonly ref: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly canvasId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly projectId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: undefined;
                        readonly required: readonly ["canvasId", "projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {}>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"projection" | "ref">[] | undefined;
                readonly required: readonly ["ref"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly ref: {
                    readonly canvasId: string;
                    readonly projectId: string;
                } & {};
            } & {
                readonly projection?: "geometry" | "structure" | undefined;
            }>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly oneOf: readonly [{
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly document: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly edges: {
                                    readonly items: {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly id: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly source: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly target: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly ["id", "source", "target"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly id: string;
                                        readonly source: string;
                                        readonly target: string;
                                    } & {}>;
                                    readonly maxItems: number;
                                    readonly minItems: number;
                                    readonly type: "array";
                                    readonly uniqueBy?: string;
                                } & PluginApiSchemaBrand<readonly ({
                                    readonly id: string;
                                    readonly source: string;
                                    readonly target: string;
                                } & {})[]>;
                                readonly id: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly nodes: {
                                    readonly items: {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly id: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly kind: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly label: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly parentId: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly position: {
                                                readonly additionalProperties: false;
                                                readonly properties: {
                                                    readonly x: {
                                                        readonly finite: true;
                                                        readonly type: "number";
                                                    } & PluginApiSchemaBrand<number>;
                                                    readonly y: {
                                                        readonly finite: true;
                                                        readonly type: "number";
                                                    } & PluginApiSchemaBrand<number>;
                                                };
                                                readonly products?: undefined;
                                                readonly required: readonly ["x", "y"];
                                                readonly type: "object";
                                            } & PluginApiSchemaBrand<{
                                                readonly x: number;
                                                readonly y: number;
                                            } & {}>;
                                            readonly size: {
                                                readonly additionalProperties: false;
                                                readonly properties: {
                                                    readonly height: {
                                                        readonly finite: true;
                                                        readonly type: "number";
                                                    } & PluginApiSchemaBrand<number>;
                                                    readonly width: {
                                                        readonly finite: true;
                                                        readonly type: "number";
                                                    } & PluginApiSchemaBrand<number>;
                                                };
                                                readonly products?: undefined;
                                                readonly required: readonly ["height", "width"];
                                                readonly type: "object";
                                            } & PluginApiSchemaBrand<{
                                                readonly height: number;
                                                readonly width: number;
                                            } & {}>;
                                            readonly type: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly ["id", "kind", "label", "position", "size"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly id: string;
                                        readonly position: {
                                            readonly x: number;
                                            readonly y: number;
                                        } & {};
                                        readonly size: {
                                            readonly height: number;
                                            readonly width: number;
                                        } & {};
                                        readonly label: string;
                                        readonly kind: string;
                                    } & {
                                        readonly type?: string | undefined;
                                        readonly parentId?: string | undefined;
                                    }>;
                                    readonly maxItems: number;
                                    readonly minItems: number;
                                    readonly type: "array";
                                    readonly uniqueBy?: string;
                                } & PluginApiSchemaBrand<readonly ({
                                    readonly id: string;
                                    readonly position: {
                                        readonly x: number;
                                        readonly y: number;
                                    } & {};
                                    readonly size: {
                                        readonly height: number;
                                        readonly width: number;
                                    } & {};
                                    readonly label: string;
                                    readonly kind: string;
                                } & {
                                    readonly type?: string | undefined;
                                    readonly parentId?: string | undefined;
                                })[]>;
                                readonly revision: {
                                    readonly finite: true;
                                    readonly minimum: 0;
                                    readonly type: "integer";
                                } & PluginApiSchemaBrand<number>;
                                readonly title: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                            };
                            readonly products?: undefined;
                            readonly required: readonly ["edges", "id", "nodes", "revision", "title"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly id: string;
                            readonly revision: number;
                            readonly title: string;
                            readonly edges: readonly ({
                                readonly id: string;
                                readonly source: string;
                                readonly target: string;
                            } & {})[];
                            readonly nodes: readonly ({
                                readonly id: string;
                                readonly position: {
                                    readonly x: number;
                                    readonly y: number;
                                } & {};
                                readonly size: {
                                    readonly height: number;
                                    readonly width: number;
                                } & {};
                                readonly label: string;
                                readonly kind: string;
                            } & {
                                readonly type?: string | undefined;
                                readonly parentId?: string | undefined;
                            })[];
                        } & {}>;
                        readonly projection: {
                            readonly const: "geometry";
                        } & PluginApiSchemaBrand<"geometry">;
                        readonly ref: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly canvasId: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly projectId: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                            };
                            readonly products?: undefined;
                            readonly required: readonly ["canvasId", "projectId"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly canvasId: string;
                            readonly projectId: string;
                        } & {}>;
                        readonly storageVersion: {
                            readonly oneOf: readonly [{
                                readonly type: "null";
                            } & PluginApiSchemaBrand<null>, {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>];
                        } & PluginApiSchemaBrand<string | null>;
                    };
                    readonly products?: readonly PluginApiWireProductConstraint<"projection" | "ref" | "storageVersion" | "document">[] | undefined;
                    readonly required: readonly ["document", "projection", "ref", "storageVersion"];
                    readonly type: "object";
                } & PluginApiSchemaBrand<{
                    readonly projection: "geometry";
                    readonly ref: {
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {};
                    readonly storageVersion: string | null;
                    readonly document: {
                        readonly id: string;
                        readonly revision: number;
                        readonly title: string;
                        readonly edges: readonly ({
                            readonly id: string;
                            readonly source: string;
                            readonly target: string;
                        } & {})[];
                        readonly nodes: readonly ({
                            readonly id: string;
                            readonly position: {
                                readonly x: number;
                                readonly y: number;
                            } & {};
                            readonly size: {
                                readonly height: number;
                                readonly width: number;
                            } & {};
                            readonly label: string;
                            readonly kind: string;
                        } & {
                            readonly type?: string | undefined;
                            readonly parentId?: string | undefined;
                        })[];
                    } & {};
                } & {}>, {
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly document: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly description: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly edges: {
                                    readonly items: {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly id: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly source: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly target: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly ["id", "source", "target"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly id: string;
                                        readonly source: string;
                                        readonly target: string;
                                    } & {}>;
                                    readonly maxItems: number;
                                    readonly minItems: number;
                                    readonly type: "array";
                                    readonly uniqueBy?: string;
                                } & PluginApiSchemaBrand<readonly ({
                                    readonly id: string;
                                    readonly source: string;
                                    readonly target: string;
                                } & {})[]>;
                                readonly id: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly nodes: {
                                    readonly items: {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly description: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly durationMs: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                            readonly id: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly kind: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly label: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly mimeType: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly name: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly parentId: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly position: {
                                                readonly additionalProperties: false;
                                                readonly properties: {
                                                    readonly x: {
                                                        readonly finite: true;
                                                        readonly type: "number";
                                                    } & PluginApiSchemaBrand<number>;
                                                    readonly y: {
                                                        readonly finite: true;
                                                        readonly type: "number";
                                                    } & PluginApiSchemaBrand<number>;
                                                };
                                                readonly products?: undefined;
                                                readonly required: readonly ["x", "y"];
                                                readonly type: "object";
                                            } & PluginApiSchemaBrand<{
                                                readonly x: number;
                                                readonly y: number;
                                            } & {}>;
                                            readonly resource: {
                                                readonly additionalProperties: false;
                                                readonly properties: {
                                                    readonly kind: {
                                                        readonly const: "project-file";
                                                    } & PluginApiSchemaBrand<"project-file">;
                                                    readonly path: {
                                                        readonly controlCharacters: false;
                                                        readonly maxLength: number;
                                                        readonly minLength: number;
                                                        readonly prefix?: string;
                                                        readonly refinement?: PluginApiStringRefinement;
                                                        readonly type: "string";
                                                    } & PluginApiSchemaBrand<string>;
                                                };
                                                readonly products?: readonly PluginApiWireProductConstraint<"kind" | "path">[] | undefined;
                                                readonly required: readonly ["kind", "path"];
                                                readonly type: "object";
                                            } & PluginApiSchemaBrand<{
                                                readonly kind: "project-file";
                                                readonly path: string;
                                            } & {}>;
                                            readonly size: {
                                                readonly additionalProperties: false;
                                                readonly properties: {
                                                    readonly height: {
                                                        readonly finite: true;
                                                        readonly type: "number";
                                                    } & PluginApiSchemaBrand<number>;
                                                    readonly width: {
                                                        readonly finite: true;
                                                        readonly type: "number";
                                                    } & PluginApiSchemaBrand<number>;
                                                };
                                                readonly products?: undefined;
                                                readonly required: readonly ["height", "width"];
                                                readonly type: "object";
                                            } & PluginApiSchemaBrand<{
                                                readonly height: number;
                                                readonly width: number;
                                            } & {}>;
                                            readonly status: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly text: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly type: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly ["id", "kind", "label", "position", "size"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly id: string;
                                        readonly position: {
                                            readonly x: number;
                                            readonly y: number;
                                        } & {};
                                        readonly size: {
                                            readonly height: number;
                                            readonly width: number;
                                        } & {};
                                        readonly label: string;
                                        readonly kind: string;
                                    } & {
                                        readonly description?: string | undefined;
                                        readonly type?: string | undefined;
                                        readonly text?: string | undefined;
                                        readonly parentId?: string | undefined;
                                        readonly status?: string | undefined;
                                        readonly durationMs?: number | undefined;
                                        readonly mimeType?: string | undefined;
                                        readonly name?: string | undefined;
                                        readonly resource?: ({
                                            readonly kind: "project-file";
                                            readonly path: string;
                                        } & {}) | undefined;
                                    }>;
                                    readonly maxItems: number;
                                    readonly minItems: number;
                                    readonly type: "array";
                                    readonly uniqueBy?: string;
                                } & PluginApiSchemaBrand<readonly ({
                                    readonly id: string;
                                    readonly position: {
                                        readonly x: number;
                                        readonly y: number;
                                    } & {};
                                    readonly size: {
                                        readonly height: number;
                                        readonly width: number;
                                    } & {};
                                    readonly label: string;
                                    readonly kind: string;
                                } & {
                                    readonly description?: string | undefined;
                                    readonly type?: string | undefined;
                                    readonly text?: string | undefined;
                                    readonly parentId?: string | undefined;
                                    readonly status?: string | undefined;
                                    readonly durationMs?: number | undefined;
                                    readonly mimeType?: string | undefined;
                                    readonly name?: string | undefined;
                                    readonly resource?: ({
                                        readonly kind: "project-file";
                                        readonly path: string;
                                    } & {}) | undefined;
                                })[]>;
                                readonly revision: {
                                    readonly finite: true;
                                    readonly minimum: 0;
                                    readonly type: "integer";
                                } & PluginApiSchemaBrand<number>;
                                readonly tags: {
                                    readonly items: {
                                        readonly controlCharacters: false;
                                        readonly maxLength: number;
                                        readonly minLength: number;
                                        readonly prefix?: string;
                                        readonly refinement?: PluginApiStringRefinement;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<string>;
                                    readonly maxItems: number;
                                    readonly minItems: number;
                                    readonly type: "array";
                                    readonly uniqueBy?: string;
                                } & PluginApiSchemaBrand<readonly string[]>;
                                readonly title: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                            };
                            readonly products?: undefined;
                            readonly required: readonly ["edges", "id", "nodes", "revision", "title"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly id: string;
                            readonly revision: number;
                            readonly title: string;
                            readonly edges: readonly ({
                                readonly id: string;
                                readonly source: string;
                                readonly target: string;
                            } & {})[];
                            readonly nodes: readonly ({
                                readonly id: string;
                                readonly position: {
                                    readonly x: number;
                                    readonly y: number;
                                } & {};
                                readonly size: {
                                    readonly height: number;
                                    readonly width: number;
                                } & {};
                                readonly label: string;
                                readonly kind: string;
                            } & {
                                readonly description?: string | undefined;
                                readonly type?: string | undefined;
                                readonly text?: string | undefined;
                                readonly parentId?: string | undefined;
                                readonly status?: string | undefined;
                                readonly durationMs?: number | undefined;
                                readonly mimeType?: string | undefined;
                                readonly name?: string | undefined;
                                readonly resource?: ({
                                    readonly kind: "project-file";
                                    readonly path: string;
                                } & {}) | undefined;
                            })[];
                        } & {
                            readonly description?: string | undefined;
                            readonly tags?: readonly string[] | undefined;
                        }>;
                        readonly projection: {
                            readonly const: "structure";
                        } & PluginApiSchemaBrand<"structure">;
                        readonly ref: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly canvasId: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly projectId: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                            };
                            readonly products?: undefined;
                            readonly required: readonly ["canvasId", "projectId"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly canvasId: string;
                            readonly projectId: string;
                        } & {}>;
                        readonly storageVersion: {
                            readonly oneOf: readonly [{
                                readonly type: "null";
                            } & PluginApiSchemaBrand<null>, {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>];
                        } & PluginApiSchemaBrand<string | null>;
                    };
                    readonly products?: readonly PluginApiWireProductConstraint<"projection" | "ref" | "storageVersion" | "document">[] | undefined;
                    readonly required: readonly ["document", "projection", "ref", "storageVersion"];
                    readonly type: "object";
                } & PluginApiSchemaBrand<{
                    readonly projection: "structure";
                    readonly ref: {
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {};
                    readonly storageVersion: string | null;
                    readonly document: {
                        readonly id: string;
                        readonly revision: number;
                        readonly title: string;
                        readonly edges: readonly ({
                            readonly id: string;
                            readonly source: string;
                            readonly target: string;
                        } & {})[];
                        readonly nodes: readonly ({
                            readonly id: string;
                            readonly position: {
                                readonly x: number;
                                readonly y: number;
                            } & {};
                            readonly size: {
                                readonly height: number;
                                readonly width: number;
                            } & {};
                            readonly label: string;
                            readonly kind: string;
                        } & {
                            readonly description?: string | undefined;
                            readonly type?: string | undefined;
                            readonly text?: string | undefined;
                            readonly parentId?: string | undefined;
                            readonly status?: string | undefined;
                            readonly durationMs?: number | undefined;
                            readonly mimeType?: string | undefined;
                            readonly name?: string | undefined;
                            readonly resource?: ({
                                readonly kind: "project-file";
                                readonly path: string;
                            } & {}) | undefined;
                        })[];
                    } & {
                        readonly description?: string | undefined;
                        readonly tags?: readonly string[] | undefined;
                    };
                } & {}>];
            } & PluginApiSchemaBrand<({
                readonly projection: "geometry";
                readonly ref: {
                    readonly canvasId: string;
                    readonly projectId: string;
                } & {};
                readonly storageVersion: string | null;
                readonly document: {
                    readonly id: string;
                    readonly revision: number;
                    readonly title: string;
                    readonly edges: readonly ({
                        readonly id: string;
                        readonly source: string;
                        readonly target: string;
                    } & {})[];
                    readonly nodes: readonly ({
                        readonly id: string;
                        readonly position: {
                            readonly x: number;
                            readonly y: number;
                        } & {};
                        readonly size: {
                            readonly height: number;
                            readonly width: number;
                        } & {};
                        readonly label: string;
                        readonly kind: string;
                    } & {
                        readonly type?: string | undefined;
                        readonly parentId?: string | undefined;
                    })[];
                } & {};
            } & {}) | ({
                readonly projection: "structure";
                readonly ref: {
                    readonly canvasId: string;
                    readonly projectId: string;
                } & {};
                readonly storageVersion: string | null;
                readonly document: {
                    readonly id: string;
                    readonly revision: number;
                    readonly title: string;
                    readonly edges: readonly ({
                        readonly id: string;
                        readonly source: string;
                        readonly target: string;
                    } & {})[];
                    readonly nodes: readonly ({
                        readonly id: string;
                        readonly position: {
                            readonly x: number;
                            readonly y: number;
                        } & {};
                        readonly size: {
                            readonly height: number;
                            readonly width: number;
                        } & {};
                        readonly label: string;
                        readonly kind: string;
                    } & {
                        readonly description?: string | undefined;
                        readonly type?: string | undefined;
                        readonly text?: string | undefined;
                        readonly parentId?: string | undefined;
                        readonly status?: string | undefined;
                        readonly durationMs?: number | undefined;
                        readonly mimeType?: string | undefined;
                        readonly name?: string | undefined;
                        readonly resource?: ({
                            readonly kind: "project-file";
                            readonly path: string;
                        } & {}) | undefined;
                    })[];
                } & {
                    readonly description?: string | undefined;
                    readonly tags?: readonly string[] | undefined;
                };
            } & {})>;
        };
    };
    readonly "canvas.nodes.query": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly query: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly ids: {
                                readonly items: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly maxItems: number;
                                readonly minItems: number;
                                readonly type: "array";
                                readonly uniqueBy?: string;
                            } & PluginApiSchemaBrand<readonly string[]>;
                            readonly kinds: {
                                readonly items: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly maxItems: number;
                                readonly minItems: number;
                                readonly type: "array";
                                readonly uniqueBy?: string;
                            } & PluginApiSchemaBrand<readonly string[]>;
                            readonly limit: {
                                readonly finite: true;
                                readonly minimum: 0;
                                readonly type: "integer";
                            } & PluginApiSchemaBrand<number>;
                            readonly relatedToNodeIds: {
                                readonly items: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly maxItems: number;
                                readonly minItems: number;
                                readonly type: "array";
                                readonly uniqueBy?: string;
                            } & PluginApiSchemaBrand<readonly string[]>;
                            readonly text: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: undefined;
                        readonly required: readonly [];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{} & {
                        readonly text?: string | undefined;
                        readonly ids?: readonly string[] | undefined;
                        readonly kinds?: readonly string[] | undefined;
                        readonly limit?: number | undefined;
                        readonly relatedToNodeIds?: readonly string[] | undefined;
                    }>;
                    readonly ref: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly canvasId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly projectId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: undefined;
                        readonly required: readonly ["canvasId", "projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {}>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"ref" | "query">[] | undefined;
                readonly required: readonly ["ref"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly ref: {
                    readonly canvasId: string;
                    readonly projectId: string;
                } & {};
            } & {
                readonly query?: ({} & {
                    readonly text?: string | undefined;
                    readonly ids?: readonly string[] | undefined;
                    readonly kinds?: readonly string[] | undefined;
                    readonly limit?: number | undefined;
                    readonly relatedToNodeIds?: readonly string[] | undefined;
                }) | undefined;
            }>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly nodes: {
                        readonly items: {
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly id: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly incomingNodeIds: {
                                    readonly items: {
                                        readonly controlCharacters: false;
                                        readonly maxLength: number;
                                        readonly minLength: number;
                                        readonly prefix?: string;
                                        readonly refinement?: PluginApiStringRefinement;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<string>;
                                    readonly maxItems: number;
                                    readonly minItems: number;
                                    readonly type: "array";
                                    readonly uniqueBy?: string;
                                } & PluginApiSchemaBrand<readonly string[]>;
                                readonly kind: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly label: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly outgoingNodeIds: {
                                    readonly items: {
                                        readonly controlCharacters: false;
                                        readonly maxLength: number;
                                        readonly minLength: number;
                                        readonly prefix?: string;
                                        readonly refinement?: PluginApiStringRefinement;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<string>;
                                    readonly maxItems: number;
                                    readonly minItems: number;
                                    readonly type: "array";
                                    readonly uniqueBy?: string;
                                } & PluginApiSchemaBrand<readonly string[]>;
                                readonly parentId: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly position: {
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly x: {
                                            readonly finite: true;
                                            readonly type: "number";
                                        } & PluginApiSchemaBrand<number>;
                                        readonly y: {
                                            readonly finite: true;
                                            readonly type: "number";
                                        } & PluginApiSchemaBrand<number>;
                                    };
                                    readonly products?: undefined;
                                    readonly required: readonly ["x", "y"];
                                    readonly type: "object";
                                } & PluginApiSchemaBrand<{
                                    readonly x: number;
                                    readonly y: number;
                                } & {}>;
                                readonly text: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                                readonly type: {
                                    readonly controlCharacters: false;
                                    readonly maxLength: number;
                                    readonly minLength: number;
                                    readonly prefix?: string;
                                    readonly refinement?: PluginApiStringRefinement;
                                    readonly type: "string";
                                } & PluginApiSchemaBrand<string>;
                            };
                            readonly products?: undefined;
                            readonly required: readonly ["id", "incomingNodeIds", "kind", "label", "outgoingNodeIds", "position"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly id: string;
                            readonly position: {
                                readonly x: number;
                                readonly y: number;
                            } & {};
                            readonly label: string;
                            readonly kind: string;
                            readonly incomingNodeIds: readonly string[];
                            readonly outgoingNodeIds: readonly string[];
                        } & {
                            readonly type?: string | undefined;
                            readonly text?: string | undefined;
                            readonly parentId?: string | undefined;
                        }>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly ({
                        readonly id: string;
                        readonly position: {
                            readonly x: number;
                            readonly y: number;
                        } & {};
                        readonly label: string;
                        readonly kind: string;
                        readonly incomingNodeIds: readonly string[];
                        readonly outgoingNodeIds: readonly string[];
                    } & {
                        readonly type?: string | undefined;
                        readonly text?: string | undefined;
                        readonly parentId?: string | undefined;
                    })[]>;
                    readonly ref: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly canvasId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly projectId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: undefined;
                        readonly required: readonly ["canvasId", "projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {}>;
                    readonly revision: {
                        readonly finite: true;
                        readonly minimum: 0;
                        readonly type: "integer";
                    } & PluginApiSchemaBrand<number>;
                    readonly storageVersion: {
                        readonly oneOf: readonly [{
                            readonly type: "null";
                        } & PluginApiSchemaBrand<null>, {
                            readonly controlCharacters: false;
                            readonly maxLength: number;
                            readonly minLength: number;
                            readonly prefix?: string;
                            readonly refinement?: PluginApiStringRefinement;
                            readonly type: "string";
                        } & PluginApiSchemaBrand<string>];
                    } & PluginApiSchemaBrand<string | null>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"revision" | "nodes" | "ref" | "storageVersion">[] | undefined;
                readonly required: readonly ["nodes", "ref", "revision", "storageVersion"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly revision: number;
                readonly nodes: readonly ({
                    readonly id: string;
                    readonly position: {
                        readonly x: number;
                        readonly y: number;
                    } & {};
                    readonly label: string;
                    readonly kind: string;
                    readonly incomingNodeIds: readonly string[];
                    readonly outgoingNodeIds: readonly string[];
                } & {
                    readonly type?: string | undefined;
                    readonly text?: string | undefined;
                    readonly parentId?: string | undefined;
                })[];
                readonly ref: {
                    readonly canvasId: string;
                    readonly projectId: string;
                } & {};
                readonly storageVersion: string | null;
            } & {}>;
        };
    };
    readonly "canvas.transaction.execute": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly commands: {
                        readonly items: {
                            readonly oneOf: readonly [{
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly edgeIds: {
                                        readonly items: {
                                            readonly controlCharacters: false;
                                            readonly maxLength: number;
                                            readonly minLength: number;
                                            readonly prefix?: string;
                                            readonly refinement?: PluginApiStringRefinement;
                                            readonly type: "string";
                                        } & PluginApiSchemaBrand<string>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly string[]>;
                                    readonly nodeIds: {
                                        readonly items: {
                                            readonly controlCharacters: false;
                                            readonly maxLength: number;
                                            readonly minLength: number;
                                            readonly prefix?: string;
                                            readonly refinement?: PluginApiStringRefinement;
                                            readonly type: "string";
                                        } & PluginApiSchemaBrand<string>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly string[]>;
                                    readonly type: {
                                        readonly const: "elements.remove";
                                    } & PluginApiSchemaBrand<"elements.remove">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "elements.remove";
                            } & {
                                readonly edgeIds?: readonly string[] | undefined;
                                readonly nodeIds?: readonly string[] | undefined;
                            }>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly direction: {
                                        readonly controlCharacters: false;
                                        readonly enum: readonly ["left", "center", "right", "top", "middle", "bottom"];
                                        readonly maxLength: number;
                                        readonly minLength: 1;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<"left" | "center" | "right" | "top" | "middle" | "bottom">;
                                    readonly nodeIds: {
                                        readonly items: {
                                            readonly controlCharacters: false;
                                            readonly maxLength: number;
                                            readonly minLength: number;
                                            readonly prefix?: string;
                                            readonly refinement?: PluginApiStringRefinement;
                                            readonly type: "string";
                                        } & PluginApiSchemaBrand<string>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly string[]>;
                                    readonly type: {
                                        readonly const: "nodes.align";
                                    } & PluginApiSchemaBrand<"nodes.align">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["direction", "nodeIds", "type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "nodes.align";
                                readonly nodeIds: readonly string[];
                                readonly direction: "left" | "center" | "right" | "top" | "middle" | "bottom";
                            } & {}>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly connection: {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly animated: {
                                                readonly type: "boolean";
                                            } & PluginApiSchemaBrand<boolean>;
                                            readonly id: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly source: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly target: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                            readonly type: {
                                                readonly controlCharacters: false;
                                                readonly maxLength: number;
                                                readonly minLength: number;
                                                readonly prefix?: string;
                                                readonly refinement?: PluginApiStringRefinement;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<string>;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly ["source", "target"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly source: string;
                                        readonly target: string;
                                    } & {
                                        readonly id?: string | undefined;
                                        readonly type?: string | undefined;
                                        readonly animated?: boolean | undefined;
                                    }>;
                                    readonly type: {
                                        readonly const: "nodes.connect";
                                    } & PluginApiSchemaBrand<"nodes.connect">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["connection", "type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly connection: {
                                    readonly source: string;
                                    readonly target: string;
                                } & {
                                    readonly id?: string | undefined;
                                    readonly type?: string | undefined;
                                    readonly animated?: boolean | undefined;
                                };
                                readonly type: "nodes.connect";
                            } & {}>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly axis: {
                                        readonly controlCharacters: false;
                                        readonly enum: readonly ["horizontal", "vertical"];
                                        readonly maxLength: number;
                                        readonly minLength: 1;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<"horizontal" | "vertical">;
                                    readonly nodeIds: {
                                        readonly items: {
                                            readonly controlCharacters: false;
                                            readonly maxLength: number;
                                            readonly minLength: number;
                                            readonly prefix?: string;
                                            readonly refinement?: PluginApiStringRefinement;
                                            readonly type: "string";
                                        } & PluginApiSchemaBrand<string>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly string[]>;
                                    readonly type: {
                                        readonly const: "nodes.distribute";
                                    } & PluginApiSchemaBrand<"nodes.distribute">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["axis", "nodeIds", "type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "nodes.distribute";
                                readonly nodeIds: readonly string[];
                                readonly axis: "horizontal" | "vertical";
                            } & {}>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly label: {
                                        readonly controlCharacters: false;
                                        readonly maxLength: number;
                                        readonly minLength: number;
                                        readonly prefix?: string;
                                        readonly refinement?: PluginApiStringRefinement;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<string>;
                                    readonly nodeIds: {
                                        readonly items: {
                                            readonly controlCharacters: false;
                                            readonly maxLength: number;
                                            readonly minLength: number;
                                            readonly prefix?: string;
                                            readonly refinement?: PluginApiStringRefinement;
                                            readonly type: "string";
                                        } & PluginApiSchemaBrand<string>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly string[]>;
                                    readonly type: {
                                        readonly const: "nodes.group";
                                    } & PluginApiSchemaBrand<"nodes.group">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["nodeIds", "type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "nodes.group";
                                readonly nodeIds: readonly string[];
                            } & {
                                readonly label?: string | undefined;
                            }>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly gap: {
                                        readonly finite: true;
                                        readonly type: "number";
                                    } & PluginApiSchemaBrand<number>;
                                    readonly layout: {
                                        readonly controlCharacters: false;
                                        readonly enum: readonly ["grid", "horizontal", "vertical"];
                                        readonly maxLength: number;
                                        readonly minLength: 1;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<"horizontal" | "vertical" | "grid">;
                                    readonly nodeIds: {
                                        readonly items: {
                                            readonly controlCharacters: false;
                                            readonly maxLength: number;
                                            readonly minLength: number;
                                            readonly prefix?: string;
                                            readonly refinement?: PluginApiStringRefinement;
                                            readonly type: "string";
                                        } & PluginApiSchemaBrand<string>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly string[]>;
                                    readonly type: {
                                        readonly const: "nodes.layout";
                                    } & PluginApiSchemaBrand<"nodes.layout">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["nodeIds", "type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "nodes.layout";
                                readonly nodeIds: readonly string[];
                            } & {
                                readonly layout?: "horizontal" | "vertical" | "grid" | undefined;
                                readonly gap?: number | undefined;
                            }>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly delta: {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly x: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                            readonly y: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly ["x", "y"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly x: number;
                                        readonly y: number;
                                    } & {}>;
                                    readonly nodeIds: {
                                        readonly items: {
                                            readonly controlCharacters: false;
                                            readonly maxLength: number;
                                            readonly minLength: number;
                                            readonly prefix?: string;
                                            readonly refinement?: PluginApiStringRefinement;
                                            readonly type: "string";
                                        } & PluginApiSchemaBrand<string>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly string[]>;
                                    readonly type: {
                                        readonly const: "nodes.move";
                                    } & PluginApiSchemaBrand<"nodes.move">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["delta", "nodeIds", "type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "nodes.move";
                                readonly nodeIds: readonly string[];
                                readonly delta: {
                                    readonly x: number;
                                    readonly y: number;
                                } & {};
                            } & {}>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly type: {
                                        readonly const: "nodes.setGeometry";
                                    } & PluginApiSchemaBrand<"nodes.setGeometry">;
                                    readonly updates: {
                                        readonly items: {
                                            readonly additionalProperties: false;
                                            readonly properties: {
                                                readonly nodeId: {
                                                    readonly controlCharacters: false;
                                                    readonly maxLength: number;
                                                    readonly minLength: number;
                                                    readonly prefix?: string;
                                                    readonly refinement?: PluginApiStringRefinement;
                                                    readonly type: "string";
                                                } & PluginApiSchemaBrand<string>;
                                                readonly position: {
                                                    readonly additionalProperties: false;
                                                    readonly properties: {
                                                        readonly x: {
                                                            readonly finite: true;
                                                            readonly type: "number";
                                                        } & PluginApiSchemaBrand<number>;
                                                        readonly y: {
                                                            readonly finite: true;
                                                            readonly type: "number";
                                                        } & PluginApiSchemaBrand<number>;
                                                    };
                                                    readonly products?: undefined;
                                                    readonly required: readonly ["x", "y"];
                                                    readonly type: "object";
                                                } & PluginApiSchemaBrand<{
                                                    readonly x: number;
                                                    readonly y: number;
                                                } & {}>;
                                                readonly size: {
                                                    readonly additionalProperties: false;
                                                    readonly properties: {
                                                        readonly height: {
                                                            readonly finite: true;
                                                            readonly type: "number";
                                                        } & PluginApiSchemaBrand<number>;
                                                        readonly width: {
                                                            readonly finite: true;
                                                            readonly type: "number";
                                                        } & PluginApiSchemaBrand<number>;
                                                    };
                                                    readonly products?: undefined;
                                                    readonly required: readonly ["height", "width"];
                                                    readonly type: "object";
                                                } & PluginApiSchemaBrand<{
                                                    readonly height: number;
                                                    readonly width: number;
                                                } & {}>;
                                            };
                                            readonly products?: undefined;
                                            readonly required: readonly ["nodeId", "position"];
                                            readonly type: "object";
                                        } & PluginApiSchemaBrand<{
                                            readonly position: {
                                                readonly x: number;
                                                readonly y: number;
                                            } & {};
                                            readonly nodeId: string;
                                        } & {
                                            readonly size?: ({
                                                readonly height: number;
                                                readonly width: number;
                                            } & {}) | undefined;
                                        }>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly ({
                                        readonly position: {
                                            readonly x: number;
                                            readonly y: number;
                                        } & {};
                                        readonly nodeId: string;
                                    } & {
                                        readonly size?: ({
                                            readonly height: number;
                                            readonly width: number;
                                        } & {}) | undefined;
                                    })[]>;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["type", "updates"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "nodes.setGeometry";
                                readonly updates: readonly ({
                                    readonly position: {
                                        readonly x: number;
                                        readonly y: number;
                                    } & {};
                                    readonly nodeId: string;
                                } & {
                                    readonly size?: ({
                                        readonly height: number;
                                        readonly width: number;
                                    } & {}) | undefined;
                                })[];
                            } & {}>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly nodeId: {
                                        readonly controlCharacters: false;
                                        readonly maxLength: number;
                                        readonly minLength: number;
                                        readonly prefix?: string;
                                        readonly refinement?: PluginApiStringRefinement;
                                        readonly type: "string";
                                    } & PluginApiSchemaBrand<string>;
                                    readonly type: {
                                        readonly const: "nodes.ungroup";
                                    } & PluginApiSchemaBrand<"nodes.ungroup">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["nodeId", "type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "nodes.ungroup";
                                readonly nodeId: string;
                            } & {}>, {
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly nodeIds: {
                                        readonly items: {
                                            readonly controlCharacters: false;
                                            readonly maxLength: number;
                                            readonly minLength: number;
                                            readonly prefix?: string;
                                            readonly refinement?: PluginApiStringRefinement;
                                            readonly type: "string";
                                        } & PluginApiSchemaBrand<string>;
                                        readonly maxItems: number;
                                        readonly minItems: number;
                                        readonly type: "array";
                                        readonly uniqueBy?: string;
                                    } & PluginApiSchemaBrand<readonly string[]>;
                                    readonly options: {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly componentGap: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                            readonly componentPackingScale: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                            readonly crossGap: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                            readonly isolatedPlacement: {
                                                readonly controlCharacters: false;
                                                readonly enum: readonly ["left", "preserve"];
                                                readonly maxLength: number;
                                                readonly minLength: 1;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<"left" | "preserve">;
                                            readonly mainGap: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                            readonly nodeGap: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                            readonly nodePackingScale: {
                                                readonly finite: true;
                                                readonly type: "number";
                                            } & PluginApiSchemaBrand<number>;
                                            readonly strategy: {
                                                readonly controlCharacters: false;
                                                readonly enum: readonly ["component-packing", "horizontal-directed-cluster", "vertical-directed-cluster"];
                                                readonly maxLength: number;
                                                readonly minLength: 1;
                                                readonly type: "string";
                                            } & PluginApiSchemaBrand<"component-packing" | "horizontal-directed-cluster" | "vertical-directed-cluster">;
                                        };
                                        readonly products?: undefined;
                                        readonly required: readonly [];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{} & {
                                        readonly isolatedPlacement?: "left" | "preserve" | undefined;
                                        readonly strategy?: "component-packing" | "horizontal-directed-cluster" | "vertical-directed-cluster" | undefined;
                                        readonly componentGap?: number | undefined;
                                        readonly componentPackingScale?: number | undefined;
                                        readonly crossGap?: number | undefined;
                                        readonly mainGap?: number | undefined;
                                        readonly nodeGap?: number | undefined;
                                        readonly nodePackingScale?: number | undefined;
                                    }>;
                                    readonly type: {
                                        readonly const: "canvas.auto-layout";
                                    } & PluginApiSchemaBrand<"canvas.auto-layout">;
                                };
                                readonly products?: undefined;
                                readonly required: readonly ["type"];
                                readonly type: "object";
                            } & PluginApiSchemaBrand<{
                                readonly type: "canvas.auto-layout";
                            } & {
                                readonly nodeIds?: readonly string[] | undefined;
                                readonly options?: ({} & {
                                    readonly isolatedPlacement?: "left" | "preserve" | undefined;
                                    readonly strategy?: "component-packing" | "horizontal-directed-cluster" | "vertical-directed-cluster" | undefined;
                                    readonly componentGap?: number | undefined;
                                    readonly componentPackingScale?: number | undefined;
                                    readonly crossGap?: number | undefined;
                                    readonly mainGap?: number | undefined;
                                    readonly nodeGap?: number | undefined;
                                    readonly nodePackingScale?: number | undefined;
                                }) | undefined;
                            }>];
                        } & PluginApiSchemaBrand<({
                            readonly type: "elements.remove";
                        } & {
                            readonly edgeIds?: readonly string[] | undefined;
                            readonly nodeIds?: readonly string[] | undefined;
                        }) | ({
                            readonly type: "nodes.align";
                            readonly nodeIds: readonly string[];
                            readonly direction: "left" | "center" | "right" | "top" | "middle" | "bottom";
                        } & {}) | ({
                            readonly connection: {
                                readonly source: string;
                                readonly target: string;
                            } & {
                                readonly id?: string | undefined;
                                readonly type?: string | undefined;
                                readonly animated?: boolean | undefined;
                            };
                            readonly type: "nodes.connect";
                        } & {}) | ({
                            readonly type: "nodes.distribute";
                            readonly nodeIds: readonly string[];
                            readonly axis: "horizontal" | "vertical";
                        } & {}) | ({
                            readonly type: "nodes.group";
                            readonly nodeIds: readonly string[];
                        } & {
                            readonly label?: string | undefined;
                        }) | ({
                            readonly type: "nodes.layout";
                            readonly nodeIds: readonly string[];
                        } & {
                            readonly layout?: "horizontal" | "vertical" | "grid" | undefined;
                            readonly gap?: number | undefined;
                        }) | ({
                            readonly type: "nodes.move";
                            readonly nodeIds: readonly string[];
                            readonly delta: {
                                readonly x: number;
                                readonly y: number;
                            } & {};
                        } & {}) | ({
                            readonly type: "nodes.setGeometry";
                            readonly updates: readonly ({
                                readonly position: {
                                    readonly x: number;
                                    readonly y: number;
                                } & {};
                                readonly nodeId: string;
                            } & {
                                readonly size?: ({
                                    readonly height: number;
                                    readonly width: number;
                                } & {}) | undefined;
                            })[];
                        } & {}) | ({
                            readonly type: "nodes.ungroup";
                            readonly nodeId: string;
                        } & {}) | ({
                            readonly type: "canvas.auto-layout";
                        } & {
                            readonly nodeIds?: readonly string[] | undefined;
                            readonly options?: ({} & {
                                readonly isolatedPlacement?: "left" | "preserve" | undefined;
                                readonly strategy?: "component-packing" | "horizontal-directed-cluster" | "vertical-directed-cluster" | undefined;
                                readonly componentGap?: number | undefined;
                                readonly componentPackingScale?: number | undefined;
                                readonly crossGap?: number | undefined;
                                readonly mainGap?: number | undefined;
                                readonly nodeGap?: number | undefined;
                                readonly nodePackingScale?: number | undefined;
                            }) | undefined;
                        })>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly (({
                        readonly type: "elements.remove";
                    } & {
                        readonly edgeIds?: readonly string[] | undefined;
                        readonly nodeIds?: readonly string[] | undefined;
                    }) | ({
                        readonly type: "nodes.align";
                        readonly nodeIds: readonly string[];
                        readonly direction: "left" | "center" | "right" | "top" | "middle" | "bottom";
                    } & {}) | ({
                        readonly connection: {
                            readonly source: string;
                            readonly target: string;
                        } & {
                            readonly id?: string | undefined;
                            readonly type?: string | undefined;
                            readonly animated?: boolean | undefined;
                        };
                        readonly type: "nodes.connect";
                    } & {}) | ({
                        readonly type: "nodes.distribute";
                        readonly nodeIds: readonly string[];
                        readonly axis: "horizontal" | "vertical";
                    } & {}) | ({
                        readonly type: "nodes.group";
                        readonly nodeIds: readonly string[];
                    } & {
                        readonly label?: string | undefined;
                    }) | ({
                        readonly type: "nodes.layout";
                        readonly nodeIds: readonly string[];
                    } & {
                        readonly layout?: "horizontal" | "vertical" | "grid" | undefined;
                        readonly gap?: number | undefined;
                    }) | ({
                        readonly type: "nodes.move";
                        readonly nodeIds: readonly string[];
                        readonly delta: {
                            readonly x: number;
                            readonly y: number;
                        } & {};
                    } & {}) | ({
                        readonly type: "nodes.setGeometry";
                        readonly updates: readonly ({
                            readonly position: {
                                readonly x: number;
                                readonly y: number;
                            } & {};
                            readonly nodeId: string;
                        } & {
                            readonly size?: ({
                                readonly height: number;
                                readonly width: number;
                            } & {}) | undefined;
                        })[];
                    } & {}) | ({
                        readonly type: "nodes.ungroup";
                        readonly nodeId: string;
                    } & {}) | ({
                        readonly type: "canvas.auto-layout";
                    } & {
                        readonly nodeIds?: readonly string[] | undefined;
                        readonly options?: ({} & {
                            readonly isolatedPlacement?: "left" | "preserve" | undefined;
                            readonly strategy?: "component-packing" | "horizontal-directed-cluster" | "vertical-directed-cluster" | undefined;
                            readonly componentGap?: number | undefined;
                            readonly componentPackingScale?: number | undefined;
                            readonly crossGap?: number | undefined;
                            readonly mainGap?: number | undefined;
                            readonly nodeGap?: number | undefined;
                            readonly nodePackingScale?: number | undefined;
                        }) | undefined;
                    }))[]>;
                    readonly expectedRevision: {
                        readonly finite: true;
                        readonly minimum: 0;
                        readonly type: "integer";
                    } & PluginApiSchemaBrand<number>;
                    readonly ref: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly canvasId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly projectId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: undefined;
                        readonly required: readonly ["canvasId", "projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {}>;
                    readonly transactionId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"ref" | "commands" | "expectedRevision" | "transactionId">[] | undefined;
                readonly required: readonly ["commands", "expectedRevision", "ref", "transactionId"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly ref: {
                    readonly canvasId: string;
                    readonly projectId: string;
                } & {};
                readonly commands: readonly (({
                    readonly type: "elements.remove";
                } & {
                    readonly edgeIds?: readonly string[] | undefined;
                    readonly nodeIds?: readonly string[] | undefined;
                }) | ({
                    readonly type: "nodes.align";
                    readonly nodeIds: readonly string[];
                    readonly direction: "left" | "center" | "right" | "top" | "middle" | "bottom";
                } & {}) | ({
                    readonly connection: {
                        readonly source: string;
                        readonly target: string;
                    } & {
                        readonly id?: string | undefined;
                        readonly type?: string | undefined;
                        readonly animated?: boolean | undefined;
                    };
                    readonly type: "nodes.connect";
                } & {}) | ({
                    readonly type: "nodes.distribute";
                    readonly nodeIds: readonly string[];
                    readonly axis: "horizontal" | "vertical";
                } & {}) | ({
                    readonly type: "nodes.group";
                    readonly nodeIds: readonly string[];
                } & {
                    readonly label?: string | undefined;
                }) | ({
                    readonly type: "nodes.layout";
                    readonly nodeIds: readonly string[];
                } & {
                    readonly layout?: "horizontal" | "vertical" | "grid" | undefined;
                    readonly gap?: number | undefined;
                }) | ({
                    readonly type: "nodes.move";
                    readonly nodeIds: readonly string[];
                    readonly delta: {
                        readonly x: number;
                        readonly y: number;
                    } & {};
                } & {}) | ({
                    readonly type: "nodes.setGeometry";
                    readonly updates: readonly ({
                        readonly position: {
                            readonly x: number;
                            readonly y: number;
                        } & {};
                        readonly nodeId: string;
                    } & {
                        readonly size?: ({
                            readonly height: number;
                            readonly width: number;
                        } & {}) | undefined;
                    })[];
                } & {}) | ({
                    readonly type: "nodes.ungroup";
                    readonly nodeId: string;
                } & {}) | ({
                    readonly type: "canvas.auto-layout";
                } & {
                    readonly nodeIds?: readonly string[] | undefined;
                    readonly options?: ({} & {
                        readonly isolatedPlacement?: "left" | "preserve" | undefined;
                        readonly strategy?: "component-packing" | "horizontal-directed-cluster" | "vertical-directed-cluster" | undefined;
                        readonly componentGap?: number | undefined;
                        readonly componentPackingScale?: number | undefined;
                        readonly crossGap?: number | undefined;
                        readonly mainGap?: number | undefined;
                        readonly nodeGap?: number | undefined;
                        readonly nodePackingScale?: number | undefined;
                    }) | undefined;
                }))[];
                readonly expectedRevision: number;
                readonly transactionId: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly affectedNodeIds: {
                        readonly items: {
                            readonly controlCharacters: false;
                            readonly maxLength: number;
                            readonly minLength: number;
                            readonly prefix?: string;
                            readonly refinement?: PluginApiStringRefinement;
                            readonly type: "string";
                        } & PluginApiSchemaBrand<string>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly string[]>;
                    readonly changed: {
                        readonly type: "boolean";
                    } & PluginApiSchemaBrand<boolean>;
                    readonly createdNodeIds: {
                        readonly items: {
                            readonly controlCharacters: false;
                            readonly maxLength: number;
                            readonly minLength: number;
                            readonly prefix?: string;
                            readonly refinement?: PluginApiStringRefinement;
                            readonly type: "string";
                        } & PluginApiSchemaBrand<string>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly string[]>;
                    readonly ref: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly canvasId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly projectId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: undefined;
                        readonly required: readonly ["canvasId", "projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {}>;
                    readonly revision: {
                        readonly finite: true;
                        readonly minimum: 0;
                        readonly type: "integer";
                    } & PluginApiSchemaBrand<number>;
                    readonly storageVersion: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                    readonly summaryTruncated: {
                        readonly type: "boolean";
                    } & PluginApiSchemaBrand<boolean>;
                    readonly warnings: {
                        readonly items: {
                            readonly controlCharacters: false;
                            readonly maxLength: number;
                            readonly minLength: number;
                            readonly prefix?: string;
                            readonly refinement?: PluginApiStringRefinement;
                            readonly type: "string";
                        } & PluginApiSchemaBrand<string>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly string[]>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"revision" | "createdNodeIds" | "warnings" | "ref" | "storageVersion" | "affectedNodeIds" | "changed" | "summaryTruncated">[] | undefined;
                readonly required: readonly ["affectedNodeIds", "changed", "createdNodeIds", "ref", "revision", "storageVersion", "warnings"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly revision: number;
                readonly createdNodeIds: readonly string[];
                readonly warnings: readonly string[];
                readonly ref: {
                    readonly canvasId: string;
                    readonly projectId: string;
                } & {};
                readonly storageVersion: string;
                readonly affectedNodeIds: readonly string[];
                readonly changed: boolean;
            } & {
                readonly summaryTruncated?: boolean | undefined;
            }>;
        };
    };
    readonly "canvas.events.subscribe": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly ref: {
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly canvasId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                            readonly projectId: {
                                readonly controlCharacters: false;
                                readonly maxLength: number;
                                readonly minLength: number;
                                readonly prefix?: string;
                                readonly refinement?: PluginApiStringRefinement;
                                readonly type: "string";
                            } & PluginApiSchemaBrand<string>;
                        };
                        readonly products?: readonly PluginApiWireProductConstraint<"canvasId" | "projectId">[] | undefined;
                        readonly required: readonly ["projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly projectId: string;
                    } & {
                        readonly canvasId?: string | undefined;
                    }>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"ref">[] | undefined;
                readonly required: readonly ["ref"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly ref: {
                    readonly projectId: string;
                } & {
                    readonly canvasId?: string | undefined;
                };
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly subscriptionId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"subscriptionId">[] | undefined;
                readonly required: readonly ["subscriptionId"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly subscriptionId: string;
            } & {}>;
        };
    };
    readonly "canvas.events.unsubscribe": {
        readonly dialect: typeof pluginApiWireSchemaDialect;
        readonly request: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly subscriptionId: {
                        readonly controlCharacters: false;
                        readonly maxLength: number;
                        readonly minLength: number;
                        readonly prefix?: string;
                        readonly refinement?: PluginApiStringRefinement;
                        readonly type: "string";
                    } & PluginApiSchemaBrand<string>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"subscriptionId">[] | undefined;
                readonly required: readonly ["subscriptionId"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly subscriptionId: string;
            } & {}>;
        };
        readonly result: {
            readonly maxBytes: number;
            readonly schema: {
                readonly additionalProperties: false;
                readonly properties: {
                    readonly removed: {
                        readonly type: "boolean";
                    } & PluginApiSchemaBrand<boolean>;
                };
                readonly products?: readonly PluginApiWireProductConstraint<"removed">[] | undefined;
                readonly required: readonly ["removed"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly removed: boolean;
            } & {}>;
        };
    };
}>;
export type PluginApiContractId = keyof typeof pluginApiWireContracts;
/** Static TypeScript projection of the exact portable runtime schema dialect. */
export type PluginApiSchemaValue<Schema extends PluginApiWireSchema> = Schema extends PluginApiSchemaBrand<infer Value> ? Value : never;
type PluginApiParamsFor<Id extends PluginApiContractId> = PluginApiSchemaValue<(typeof pluginApiWireContracts)[Id]["request"]["schema"]>;
type PluginApiResultFor<Id extends PluginApiContractId> = PluginApiSchemaValue<(typeof pluginApiWireContracts)[Id]["result"]["schema"]>;
export type PluginApiMethodMap = {
    readonly [Id in PluginApiContractId]: {
        readonly params: PluginApiParamsFor<Id>;
        readonly result: PluginApiResultFor<Id>;
    };
};
export type PluginApiParams<Id extends PluginApiContractId> = PluginApiMethodMap[Id]["params"];
export type PluginApiResult<Id extends PluginApiContractId> = PluginApiMethodMap[Id]["result"];
export type PluginApiCall<Id extends PluginApiContractId = PluginApiContractId> = {
    readonly [Method in Id]: PluginApiParams<Method> extends undefined ? {
        readonly method: Method;
        readonly params?: never;
    } : undefined extends PluginApiParams<Method> ? {
        readonly method: Method;
        readonly params?: Exclude<PluginApiParams<Method>, undefined>;
    } : {
        readonly method: Method;
        readonly params: PluginApiParams<Method>;
    };
}[Id];
export declare const maximumPluginApiRequestBytes: number;
export declare const maximumPluginApiResultBytes: number;
export declare function getPluginApiWireContract<Id extends PluginApiContractId>(id: Id): (typeof pluginApiWireContracts)[Id];
export {};
//# sourceMappingURL=method-schemas.d.ts.map
export type PluginApiStringRefinement = "portable-project-relative-path" | "safe-png-file-name" | "trimmed";
export type PluginApiWireSchema = {
    readonly type: "none";
} | {
    readonly type: "boolean";
} | {
    readonly const: boolean | number | string;
} | {
    readonly type: "integer" | "number";
    readonly finite: true;
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
    readonly request: PluginApiWireLimit;
    readonly result: PluginApiWireLimit;
}
/** Versioned semantics of the portable schema interpreter and generated contracts. */
export declare const pluginApiWireSchemaDialect: "convax.plugin-api-wire-schema/2";
declare const pluginApiSchemaValue: unique symbol;
interface PluginApiSchemaBrand<Value> {
    readonly [pluginApiSchemaValue]: Value;
}
export type PluginApiJsonValue = null | boolean | number | string | readonly PluginApiJsonValue[] | {
    readonly [key: string]: PluginApiJsonValue;
};
/**
 * Complete portable wire schemas and byte budgets for every Host API.
 *
 * These values are serialized into the generated Catalog and immutable history.
 * Runtime parsers in `method-contracts.ts` enforce the same closed contract.
 */
export declare const pluginApiWireContracts: Readonly<{
    readonly "host.context.get": {
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
                                        readonly required: readonly ["available", "catalogVersion", "id", "since"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly since: string;
                                        readonly id: string;
                                        readonly available: true;
                                        readonly catalogVersion: string;
                                    } & {}>, {
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly available: {
                                                readonly const: false;
                                            } & PluginApiSchemaBrand<false>;
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
                                        readonly required: readonly ["available", "id", "reason", "recoverable"];
                                        readonly type: "object";
                                    } & PluginApiSchemaBrand<{
                                        readonly id: string;
                                        readonly recoverable: boolean;
                                        readonly available: false;
                                        readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                                    } & {
                                        readonly since?: string | undefined;
                                    }>];
                                } & PluginApiSchemaBrand<({
                                    readonly since: string;
                                    readonly id: string;
                                    readonly available: true;
                                    readonly catalogVersion: string;
                                } & {}) | ({
                                    readonly id: string;
                                    readonly recoverable: boolean;
                                    readonly available: false;
                                    readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                                } & {
                                    readonly since?: string | undefined;
                                })>;
                                readonly maxItems: number;
                                readonly minItems: number;
                                readonly type: "array";
                                readonly uniqueBy?: string;
                            } & PluginApiSchemaBrand<readonly (({
                                readonly since: string;
                                readonly id: string;
                                readonly available: true;
                                readonly catalogVersion: string;
                            } & {}) | ({
                                readonly id: string;
                                readonly recoverable: boolean;
                                readonly available: false;
                                readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                            } & {
                                readonly since?: string | undefined;
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
                        readonly required: readonly ["availability", "catalogVersion"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly catalogVersion: string;
                        readonly availability: readonly (({
                            readonly since: string;
                            readonly id: string;
                            readonly available: true;
                            readonly catalogVersion: string;
                        } & {}) | ({
                            readonly id: string;
                            readonly recoverable: boolean;
                            readonly available: false;
                            readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                        } & {
                            readonly since?: string | undefined;
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
                        readonly required: readonly ["id"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly id: string;
                    } & {
                        readonly name?: string | undefined;
                    }>;
                };
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
                        readonly available: true;
                        readonly catalogVersion: string;
                    } & {}) | ({
                        readonly id: string;
                        readonly recoverable: boolean;
                        readonly available: false;
                        readonly reason: "unsupported-host" | "not-declared" | "permission-denied" | "wrong-surface" | "missing-context" | "setup-required" | "disabled" | "recovering";
                    } & {
                        readonly since?: string | undefined;
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
                            readonly required: readonly ["inputKey", "kind", "label"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly label: string;
                            readonly inputKey: string;
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
                        readonly label: string;
                        readonly inputKey: string;
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
                readonly required: readonly ["inputs"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly inputs: readonly ({
                    readonly label: string;
                    readonly inputKey: string;
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
    readonly "canvas.inputs.open": {
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
                readonly required: readonly ["closed"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly closed: boolean;
            } & {}>;
        };
    };
    readonly "canvas.node.get": {
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
                readonly required: readonly ["updated"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly updated: true;
            } & {}>;
        };
    };
    readonly "canvas.resource.image.create": {
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
                readonly required: readonly ["createdNodeId", "revision"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly revision: number;
                readonly createdNodeId: string;
            } & {}>;
        };
    };
    readonly "project.file.text.read": {
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
                readonly required: readonly ["text"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly text: string;
            } & {}>;
        };
    };
    readonly "generation.tools.list": {
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
                                readonly nodeId: {
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
                            readonly required: readonly ["nodeId", "role"];
                            readonly type: "object";
                        } & PluginApiSchemaBrand<{
                            readonly nodeId: string;
                            readonly role: "text" | "audio" | "reference_image" | "reference_video" | "first_frame" | "last_frame";
                        } & {}>;
                        readonly maxItems: number;
                        readonly minItems: number;
                        readonly type: "array";
                        readonly uniqueBy?: string;
                    } & PluginApiSchemaBrand<readonly ({
                        readonly nodeId: string;
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
                readonly required: readonly ["prompt"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly prompt: string;
            } & {
                readonly output?: "text" | "image" | "video" | "audio" | undefined;
                readonly references?: readonly ({
                    readonly nodeId: string;
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
                        readonly required: readonly ["canvasId", "projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {}>;
                };
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
                        readonly required: readonly ["canvasId", "projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly canvasId: string;
                        readonly projectId: string;
                    } & {}>;
                };
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
                                                    readonly required: readonly ["height", "width"];
                                                    readonly type: "object";
                                                } & PluginApiSchemaBrand<{
                                                    readonly height: number;
                                                    readonly width: number;
                                                } & {}>;
                                            };
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
                        readonly required: readonly ["projectId"];
                        readonly type: "object";
                    } & PluginApiSchemaBrand<{
                        readonly projectId: string;
                    } & {
                        readonly canvasId?: string | undefined;
                    }>;
                };
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
                readonly required: readonly ["subscriptionId"];
                readonly type: "object";
            } & PluginApiSchemaBrand<{
                readonly subscriptionId: string;
            } & {}>;
        };
    };
    readonly "canvas.events.unsubscribe": {
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
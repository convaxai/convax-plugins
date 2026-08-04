export declare const portablePluginStateSchemaFormat: "convax.plugin-state-schema/1";
export type PortableBoundedValueSchemaV1 = Readonly<{
    type: "null";
}> | Readonly<{
    type: "boolean";
}> | Readonly<{
    type: "string";
    maxUtf8Bytes: string;
    enum?: readonly string[];
}> | Readonly<{
    type: "integer";
    minimum: string;
    maximum: string;
}> | Readonly<{
    type: "array";
    maxItems: string;
    items: PortableBoundedValueSchemaV1;
}> | Readonly<{
    type: "object";
    maxProperties: string;
    required: readonly string[];
    properties: Readonly<Record<string, PortableBoundedValueSchemaV1>>;
    additionalProperties: false;
}> | Readonly<{
    type: "union";
    variants: readonly PortableBoundedValueSchemaV1[];
}>;
export declare function parsePortablePluginStateSchemaV1(value: unknown): PortableBoundedValueSchemaV1;
export declare function canonicalPortablePluginStateSchemaBytesV1(value: unknown): Readonly<Uint8Array>;
export declare function pluginStateSchemaDigestInputV1(value: unknown): Readonly<Uint8Array>;
export declare function assertPortablePluginStateValueV1(schemaInput: PortableBoundedValueSchemaV1, value: unknown): void;
//# sourceMappingURL=index.d.ts.map
import { type PluginApiId, type ApiAvailability, type PluginApiHostContextResult, type PluginApiParams, type PluginApiResult } from "@convax/plugin-api";
import { type PluginCapabilitySchema } from "./capabilities";
import { type PluginHostCapabilityAvailability, type PluginHostCommand, type PluginHostRemoteFailure } from "./host-protocol";
import { type PortablePluginManifestV8 } from "./manifest";
export * from "./host-protocol";
export interface PluginHostMessageEvent {
    readonly data: unknown;
}
/**
 * Structural subset of MessagePort used by the SDK. It intentionally avoids a
 * DOM library dependency while remaining implementable by a browser MessagePort.
 */
export interface PluginHostMessagePort {
    addEventListener(type: "message", listener: (event: PluginHostMessageEvent) => void): void;
    close(): void;
    removeEventListener(type: "message", listener: (event: PluginHostMessageEvent) => void): void;
    postMessage(message: unknown): void;
    start?(): void;
}
/** Structural AbortSignal subset, avoiding a DOM type dependency in declarations. */
export interface PluginHostAbortSignal {
    readonly aborted: boolean;
    readonly reason?: unknown;
    addEventListener(type: "abort", listener: () => void, options?: {
        readonly once?: boolean;
    }): void;
    removeEventListener(type: "abort", listener: () => void): void;
}
export interface PluginHostCallOptions {
    readonly signal?: PluginHostAbortSignal;
}
export interface PluginHostClientOptions<Manifest extends PortablePluginManifestV8> {
    readonly manifest: Manifest;
    readonly onFatalError?: (error: PluginHostProtocolError) => void;
    readonly port: PluginHostMessagePort;
    /**
     * Bounded diagnostic prefix only. The SDK appends a monotonic counter and
     * never reuses an id for the lifetime of this client.
     */
    readonly requestIdPrefix?: string;
}
type RequiredSchemaKeys<Properties extends Readonly<Record<string, PluginCapabilitySchema>>, Required> = Extract<Required extends readonly string[] ? Required[number] : never, keyof Properties>;
/** Static value projection for the SDK's closed, bounded capability schema subset. */
export type PluginCapabilitySchemaValue<Schema extends PluginCapabilitySchema> = Schema extends {
    readonly type: "null";
} ? null : Schema extends {
    readonly type: "boolean";
} ? boolean : Schema extends {
    readonly type: "number" | "integer";
} ? number : Schema extends {
    readonly type: "string";
    readonly enum: readonly (infer EnumValue extends string)[];
} ? EnumValue : Schema extends {
    readonly type: "string";
} ? string : Schema extends {
    readonly type: "array";
    readonly items: infer Item extends PluginCapabilitySchema;
} ? readonly PluginCapabilitySchemaValue<Item>[] : Schema extends {
    readonly type: "object";
    readonly properties: infer Properties extends Readonly<Record<string, PluginCapabilitySchema>>;
    readonly required: infer Required extends readonly string[];
} ? {
    readonly [Key in RequiredSchemaKeys<Properties, Required>]-?: PluginCapabilitySchemaValue<Properties[Key]>;
} & {
    readonly [Key in Exclude<keyof Properties, RequiredSchemaKeys<Properties, Required>>]?: PluginCapabilitySchemaValue<Properties[Key]>;
} : never;
type CapabilityDeclarationOf<Manifest extends PortablePluginManifestV8> = NonNullable<Manifest["contributes"]["capabilities"]>;
type CapabilityImportOf<Manifest extends PortablePluginManifestV8> = CapabilityDeclarationOf<Manifest>["imports"]["required"][number] | CapabilityDeclarationOf<Manifest>["imports"]["optional"][number];
export type PluginHostImportedCapabilityId<Manifest extends PortablePluginManifestV8> = CapabilityImportOf<Manifest>["id"];
type CapabilityImportById<Manifest extends PortablePluginManifestV8, Id extends PluginHostImportedCapabilityId<Manifest>> = Extract<CapabilityImportOf<Manifest>, {
    readonly id: Id;
}> extends never ? CapabilityImportOf<Manifest> : Extract<CapabilityImportOf<Manifest>, {
    readonly id: Id;
}>;
export type PluginHostCapabilityInput<Manifest extends PortablePluginManifestV8, Id extends PluginHostImportedCapabilityId<Manifest>> = PluginCapabilitySchemaValue<CapabilityImportById<Manifest, Id>["inputSchema"]>;
export type PluginHostCapabilityOutput<Manifest extends PortablePluginManifestV8, Id extends PluginHostImportedCapabilityId<Manifest>> = PluginCapabilitySchemaValue<CapabilityImportById<Manifest, Id>["outputSchema"]>;
type DeclaredApiId<Manifest extends PortablePluginManifestV8> = Manifest["hostApi"]["required"][number] | Manifest["hostApi"]["optional"][number];
export type PluginHostDeclaredApiId<Manifest extends PortablePluginManifestV8> = PluginApiId extends DeclaredApiId<Manifest> ? PluginApiId : Extract<DeclaredApiId<Manifest>, PluginApiId>;
export type PluginHostApiCallArguments<Id extends PluginApiId> = [PluginApiParams<Id>] extends [undefined] ? readonly [options?: PluginHostCallOptions] : undefined extends PluginApiParams<Id> ? readonly [params?: Exclude<PluginApiParams<Id>, undefined>, options?: PluginHostCallOptions] : readonly [params: PluginApiParams<Id>, options?: PluginHostCallOptions];
export declare class PluginHostProtocolError extends Error {
    readonly code: "closed" | "invalid-envelope" | "invalid-result" | "request-id-exhausted" | "transport-failed" | "unknown-response";
    constructor(code: PluginHostProtocolError["code"], message: string);
}
export declare class PluginHostRemoteError extends Error {
    readonly code: PluginHostRemoteFailure["code"];
    readonly kind: PluginHostRemoteFailure["kind"];
    readonly recoverable: boolean;
    constructor(failure: PluginHostRemoteFailure);
}
export declare class PluginHostAbortError extends Error {
    readonly reason: unknown;
    constructor(reason: unknown);
}
export interface PluginHostClient<Manifest extends PortablePluginManifestV8> {
    readonly closed: boolean;
    callHostApi<Id extends PluginHostDeclaredApiId<Manifest>>(method: Id, ...args: PluginHostApiCallArguments<Id>): Promise<PluginApiResult<Id>>;
    getHostApiAvailability<Id extends PluginHostDeclaredApiId<Manifest>>(id: Id, options?: PluginHostAvailabilityOptions): Promise<ApiAvailability<Id>>;
    refreshHostApiContext(options?: PluginHostCallOptions): Promise<PluginApiHostContextResult>;
    requireHostApi<Id extends PluginHostDeclaredApiId<Manifest>>(id: Id, options?: PluginHostAvailabilityOptions): Promise<Extract<ApiAvailability<Id>, {
        available: true;
    }>>;
    getCapabilityAvailability<Id extends PluginHostImportedCapabilityId<Manifest>>(capabilityId: Id, options?: PluginHostCallOptions): Promise<PluginHostCapabilityAvailability>;
    invokeCapability<Id extends PluginHostImportedCapabilityId<Manifest>>(capabilityId: Id, input: PluginHostCapabilityInput<Manifest, Id>, options?: PluginHostCallOptions): Promise<PluginHostCapabilityOutput<Manifest, Id>>;
    onCommand(listener: (command: PluginHostCommand) => void): () => void;
    close(): void;
}
export interface PluginHostAvailabilityOptions extends PluginHostCallOptions {
    /** Re-read host.context.get instead of using this client's last validated context. */
    readonly refresh?: boolean;
}
export declare function createPluginHostClient<const Manifest extends PortablePluginManifestV8>(options: PluginHostClientOptions<Manifest>): PluginHostClient<Manifest>;
//# sourceMappingURL=client.d.ts.map
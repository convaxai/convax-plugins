import { type PluginApiCall, type PluginApiErrorCode } from "@convax/plugin-api";
import { type PluginCapabilityImportRequirement, type PluginCapabilityUnavailableReason, type PluginCapabilityVersion } from "./capabilities";
/**
 * The only author-facing sandboxed Web Plugin MessagePort ABI.
 * `convax.plugin-capability/3` is deliberately absent: it is Host-internal.
 */
export declare const pluginHostProtocolV8: "convax.plugin-host/8";
export type PluginHostProtocol = typeof pluginHostProtocolV8;
/** Largest Catalog Host API envelope. Per-API limits remain authoritative. */
export declare const maximumPluginHostRequestBytes: number;
/** Largest Catalog Host API result. Per-API limits remain authoritative. */
export declare const maximumPluginHostResponseBytes: number;
/** P2P capabilities deliberately retain a smaller independent attack surface. */
export declare const maximumPluginCapabilityRequestBytes: number;
export declare const maximumPluginCapabilityResponseBytes: number;
/** Fixed control envelopes contain no caller-selected identifiers or payloads. */
export declare const maximumPluginHostControlBytes = 128;
export declare const maximumPluginHostInFlightRequests = 16;
export declare const maximumPluginHostRequestIdLength = 128;
export declare const maximumPluginHostIngressDepth = 64;
/**
 * Any JSON tree inside the global byte limit has fewer entries than this
 * conservative two-byte-per-entry ceiling. It therefore cannot reject a
 * Catalog-valid payload independently of the byte limit.
 */
export declare const maximumPluginHostIngressEntries: number;
export interface PluginHostConnect {
    readonly pluginId: string;
    readonly protocol: PluginHostProtocol;
    readonly type: "connect";
}
export type PluginHostRequest = PluginApiCall & {
    readonly id: string;
    readonly protocol: PluginHostProtocol;
    readonly type: "request";
};
export interface PluginHostCapabilityInvokeRequest {
    readonly capabilityId: string;
    readonly id: string;
    readonly input: unknown;
    readonly protocol: PluginHostProtocol;
    readonly type: "capability-invoke";
}
export interface PluginHostCapabilityAvailabilityRequest {
    readonly capabilityId: string;
    readonly id: string;
    readonly protocol: PluginHostProtocol;
    readonly type: "capability-availability";
}
/**
 * Cancels one request previously sent by the same MessagePort.
 * The id is never resolved outside that sender-scoped connection.
 */
export interface PluginHostCancel {
    readonly id: string;
    readonly protocol: PluginHostProtocol;
    readonly type: "cancel";
}
/**
 * Closes only the exact sender-scoped MessagePort connection.
 *
 * This is protocol lifecycle control, not a Host API or Plugin capability. It
 * deliberately carries no caller-selected identity, scope, or payload.
 */
export interface PluginHostDisconnect {
    readonly protocol: PluginHostProtocol;
    readonly type: "disconnect";
}
export type PluginCapabilityRemoteErrorCode = "canceled" | "contract-mismatch" | "depth-exceeded" | "duplicate-request" | "execution-failed" | "invalid-input" | "invalid-output" | "overloaded" | "provider-unavailable" | "reentrant-call";
export type PluginHostProtocolRemoteErrorCode = "canceled" | "internal-error" | "invalid-request" | "overloaded" | "transport-closed";
export type PluginHostRemoteFailure = {
    readonly code: PluginApiErrorCode;
    readonly kind: "api";
    readonly message: string;
    readonly recoverable: boolean;
} | {
    readonly code: PluginCapabilityRemoteErrorCode;
    readonly kind: "capability";
    readonly message: string;
    readonly recoverable: boolean;
} | {
    readonly code: PluginHostProtocolRemoteErrorCode;
    readonly kind: "protocol";
    readonly message: string;
    readonly recoverable: boolean;
};
export type PluginHostResponse = {
    readonly id: string;
    readonly ok: true;
    readonly protocol: PluginHostProtocol;
    readonly result: unknown;
    readonly type: "response";
} | {
    readonly error: PluginHostRemoteFailure;
    readonly id: string;
    readonly ok: false;
    readonly protocol: PluginHostProtocol;
    readonly type: "response";
};
export interface PluginHostCommand {
    readonly command: string;
    readonly params?: unknown;
    readonly protocol: PluginHostProtocol;
    readonly type: "command";
}
/**
 * Portable availability deliberately excludes provider Plugin and snapshot
 * identity. ActiveSet routing is Host-owned and opaque to Web Plugins.
 */
export type PluginHostCapabilityAvailability = {
    readonly available: true;
    readonly capabilityId: string;
    readonly requirement: PluginCapabilityImportRequirement;
    readonly version: PluginCapabilityVersion;
} | {
    readonly available: false;
    readonly capabilityId: string;
    readonly reason: PluginCapabilityUnavailableReason;
    readonly recoverable: boolean;
    readonly requirement: PluginCapabilityImportRequirement;
};
export declare const pluginCapabilityRemoteErrors: Readonly<{
    canceled: {
        recoverable: true;
    };
    "contract-mismatch": {
        recoverable: false;
    };
    "depth-exceeded": {
        recoverable: false;
    };
    "duplicate-request": {
        recoverable: false;
    };
    "execution-failed": {
        recoverable: false;
    };
    "invalid-input": {
        recoverable: false;
    };
    "invalid-output": {
        recoverable: false;
    };
    overloaded: {
        recoverable: true;
    };
    "provider-unavailable": {
        recoverable: true;
    };
    "reentrant-call": {
        recoverable: false;
    };
}>;
export declare const pluginHostProtocolRemoteErrors: Readonly<{
    canceled: {
        recoverable: true;
    };
    "internal-error": {
        recoverable: false;
    };
    "invalid-request": {
        recoverable: false;
    };
    overloaded: {
        recoverable: true;
    };
    "transport-closed": {
        recoverable: true;
    };
}>;
/**
 * Performs a non-recursive, fail-closed JSON-tree and byte preflight before any
 * method or result schema walks an untrusted Web MessagePort value.
 */
export declare function assertPluginHostMessageByteLength(value: unknown, maximumBytes: number, label?: string): number;
export declare function isPluginHostRequestId(value: unknown): value is string;
export declare function isPluginHostConnect(value: unknown): value is PluginHostConnect;
export declare function isPluginHostRequest(value: unknown): value is PluginHostRequest;
export declare function isPluginHostCapabilityInvokeRequest(value: unknown): value is PluginHostCapabilityInvokeRequest;
export declare function isPluginHostCapabilityAvailabilityRequest(value: unknown): value is PluginHostCapabilityAvailabilityRequest;
export declare function isPluginHostCancel(value: unknown): value is PluginHostCancel;
export declare function isPluginHostDisconnect(value: unknown): value is PluginHostDisconnect;
export declare function isPluginHostResponse(value: unknown): value is PluginHostResponse;
export declare function isPluginHostCommand(value: unknown): value is PluginHostCommand;
export declare function parsePluginHostCapabilityAvailability(value: unknown): PluginHostCapabilityAvailability;
export declare function parsePluginCapabilityRemoteFailure(value: unknown): PluginHostRemoteFailure;
export declare function parsePluginHostProtocolRemoteFailure(value: unknown): PluginHostRemoteFailure;
export declare function pluginHostConnect(pluginId: string): PluginHostConnect;
export declare function pluginHostSuccess(id: string, result: unknown): PluginHostResponse;
export declare function pluginHostFailure(id: string, error: PluginHostRemoteFailure): PluginHostResponse;
//# sourceMappingURL=host-protocol.d.ts.map
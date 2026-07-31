import { type PetHostEventContract, type PetHostEventName, type PetHostMethodForSurface, type PetHostParams, type PetHostResult, type PetHostSurface } from "./pet";
export * from "./pet";
export interface PetHostMessageEvent {
    readonly data: unknown;
    readonly ports?: readonly PetHostMessagePort[];
    readonly source: unknown;
}
export interface PetHostMessagePort {
    close(): void;
    onmessage: ((event: {
        readonly data: unknown;
    }) => void) | null;
    postMessage(message: unknown): void;
    start?(): void;
}
export interface PetHostWindow {
    readonly location: {
        readonly hostname: string;
        readonly protocol: string;
    };
    readonly parent: unknown;
    addEventListener(type: "message", listener: (event: PetHostMessageEvent) => void): void;
    removeEventListener(type: "message", listener: (event: PetHostMessageEvent) => void): void;
}
export interface ConnectPetHostOptions<Surface extends PetHostSurface> {
    readonly handshakeTimeoutMs?: number;
    readonly requestTimeoutMs?: number;
    /** Test and non-browser adapter seam. Browser Plugins should omit this. */
    readonly source?: PetHostWindow;
    readonly surface: Surface;
}
export interface PetHostAbortSignal {
    readonly aborted: boolean;
    readonly reason?: unknown;
    addEventListener(type: "abort", listener: () => void, options?: {
        readonly once?: boolean;
    }): void;
    removeEventListener(type: "abort", listener: () => void): void;
}
export interface PetHostRequestOptions {
    readonly signal?: PetHostAbortSignal;
}
export interface PetHostClient<Surface extends PetHostSurface> {
    readonly closed: boolean;
    readonly surface: Surface;
    close(): void;
    request<Method extends PetHostMethodForSurface<Surface>>(method: Method, params: PetHostParams<Method>, options?: PetHostRequestOptions): Promise<PetHostResult<Method>>;
    subscribe<Event extends PetHostEventName>(event: Event, listener: (payload: PetHostEventContract[Event]) => void): () => void;
}
export declare class PetHostClientError extends Error {
    readonly code: "aborted" | "closed" | "invalid-message" | "overloaded" | "remote-error" | "timeout" | "transport-error";
    constructor(code: PetHostClientError["code"], message: string);
}
/**
 * Connects the current Pet contribution surface to its Host-owned snapshot.
 * Plugin identity is derived from the immutable `convax-plugin:` origin and is
 * intentionally absent from author options.
 */
export declare function connectPetHost<const Surface extends PetHostSurface>(options: ConnectPetHostOptions<Surface>): Promise<PetHostClient<Surface>>;
//# sourceMappingURL=pet-client.d.ts.map
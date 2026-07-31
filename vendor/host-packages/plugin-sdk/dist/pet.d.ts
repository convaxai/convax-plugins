/** Public, contribution-scoped Pet surface protocol shared by the Host and Plugin authors. */
export declare const petHostProtocol: "convax.pet-host/1";
export declare const petHostMaximumMessageBytes: number;
export declare const petHostMaximumPendingRequests = 64;
export type PetHostSurface = "overlay" | "settings";
export type PetVisibleActivityState = "needs-input" | "blocked" | "ready" | "running";
export interface PetActivitySummary {
    id: string;
    input?: "permission" | "question";
    projectId: string;
    projectName: string;
    sessionId: string;
    sessionName: string;
    state: PetVisibleActivityState;
    updatedAt: number;
}
export interface PetActivitySnapshot {
    activities: PetActivitySummary[];
    revision: number;
}
export interface PetPreferences {
    awake: boolean;
    selectedPetId?: string;
}
export interface PetPreferencesUpdate {
    selectedPetId: string;
}
export interface PetCustomPet {
    alt: string;
    description: string;
    displayName: string;
    id: string;
    source: "custom";
    spritesheetUrl: string;
    spriteVersion: 2;
}
export interface PetCustomCollectionSnapshot {
    pets: PetCustomPet[];
    revision: number;
}
export interface PetCustomDelete {
    petId: string;
}
export interface PetNavigationRequest {
    activityId: string;
    revision: number;
}
export interface PetDragInput {
    phase: "end" | "move" | "start";
    screenX: number;
    screenY: number;
    sequence: number;
    session: string;
}
export interface PetHostMethodContract {
    readonly "activity.getSnapshot": {
        readonly params: Record<string, never>;
        readonly result: PetActivitySnapshot;
    };
    readonly "activity.open": {
        readonly params: PetNavigationRequest;
        readonly result: unknown;
    };
    readonly "collection.delete": {
        readonly params: PetCustomDelete;
        readonly result: PetCustomCollectionSnapshot;
    };
    readonly "collection.get": {
        readonly params: Record<string, never>;
        readonly result: PetCustomCollectionSnapshot;
    };
    readonly "collection.import": {
        readonly params: Record<string, never>;
        readonly result: PetCustomPet | null;
    };
    readonly "lifecycle.setAwake": {
        readonly params: {
            readonly awake: boolean;
        };
        readonly result: PetPreferences;
    };
    readonly "overlay.move": {
        readonly params: PetDragInput;
        readonly result: unknown;
    };
    readonly "overlay.setExpanded": {
        readonly params: {
            readonly expanded: boolean;
        };
        readonly result: unknown;
    };
    readonly "preferences.get": {
        readonly params: Record<string, never>;
        readonly result: PetPreferences;
    };
    readonly "preferences.update": {
        readonly params: PetPreferencesUpdate;
        readonly result: PetPreferences;
    };
}
export type PetHostMethod = keyof PetHostMethodContract;
export type PetHostMethodForSurface<Surface extends PetHostSurface> = Surface extends "overlay" ? "activity.getSnapshot" | "activity.open" | "collection.get" | "overlay.move" | "overlay.setExpanded" | "preferences.get" | "preferences.update" : "collection.delete" | "collection.get" | "collection.import" | "lifecycle.setAwake" | "preferences.get" | "preferences.update";
export type PetHostParams<Method extends PetHostMethod> = PetHostMethodContract[Method]["params"];
export type PetHostResult<Method extends PetHostMethod> = PetHostMethodContract[Method]["result"];
export declare function isPetHostMethodForSurface<Surface extends PetHostSurface>(surface: Surface, method: unknown): method is PetHostMethodForSurface<Surface>;
interface PetHostRequestBase {
    readonly id: string;
    readonly protocol: typeof petHostProtocol;
    readonly type: "request";
}
export type PetHostRequest = {
    readonly [Method in PetHostMethod]: PetHostRequestBase & {
        readonly method: Method;
        readonly params: PetHostParams<Method>;
    };
}[PetHostMethod];
export type PetHostResponse = {
    readonly id: string;
    readonly ok: true;
    readonly protocol: typeof petHostProtocol;
    readonly result: unknown;
    readonly type: "response";
} | {
    readonly error: string;
    readonly id: string;
    readonly ok: false;
    readonly protocol: typeof petHostProtocol;
    readonly type: "response";
};
export interface PetHostEventContract {
    readonly "activity.changed": PetActivitySnapshot;
    readonly "collection.changed": PetCustomCollectionSnapshot;
    readonly "preferences.changed": PetPreferences;
}
export type PetHostEventName = keyof PetHostEventContract;
export type PetHostEventPayload<Event extends PetHostEventName> = PetHostEventContract[Event];
export type PetHostEvent = {
    readonly [Event in PetHostEventName]: {
        readonly event: Event;
        readonly payload: PetHostEventPayload<Event>;
        readonly protocol: typeof petHostProtocol;
        readonly type: "event";
    };
}[PetHostEventName];
export type PetHostMessage = PetHostEvent | PetHostResponse;
export interface PetHostOverlayConnect {
    readonly pluginId: string;
    readonly protocol: typeof petHostProtocol;
    readonly surface: "overlay";
    readonly type: "connect";
}
export interface PetHostSettingsConnect {
    readonly connectionId: string;
    readonly generation: number;
    readonly pluginId: string;
    readonly protocol: typeof petHostProtocol;
    readonly surface: "settings";
    readonly type: "connect";
}
export type PetHostConnect = PetHostOverlayConnect | PetHostSettingsConnect;
export declare function parsePetHostParams<Method extends PetHostMethod>(method: Method, value: unknown): PetHostParams<Method>;
export declare function isPetHostMessageWithinLimit(value: unknown): boolean;
export declare function parsePetActivitySnapshot(value: unknown): PetActivitySnapshot;
export declare function parsePetPreferences(value: unknown): PetPreferences;
export declare function parsePetCustomPet(value: unknown): PetCustomPet;
export declare function parsePetCustomCollectionSnapshot(value: unknown): PetCustomCollectionSnapshot;
export declare function parsePetHostResult<Method extends PetHostMethod>(method: Method, value: unknown): PetHostResult<Method>;
export declare function parsePetHostEvent(value: unknown): PetHostEvent;
export declare function isPetHostConnect<Surface extends PetHostSurface>(value: unknown, surface: Surface, expectedPluginId: string): value is Extract<PetHostConnect, {
    readonly surface: Surface;
}>;
export {};
//# sourceMappingURL=pet.d.ts.map
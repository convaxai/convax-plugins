import type { PortablePluginCanvasSelectionActionContribution } from "./canvas";
export declare const portablePluginGenerationModalities: readonly ["text", "image", "video", "audio"];
export declare const portablePluginGenerationInputRoles: readonly ["reference_image", "reference_video", "first_frame", "last_frame", "audio", "text"];
export type PortablePluginGenerationModality = (typeof portablePluginGenerationModalities)[number];
export type PortablePluginGenerationInputRole = (typeof portablePluginGenerationInputRoles)[number];
export type PortablePluginGenerationDelivery = "canvas" | "return";
export type PortablePluginGenerationInputBinding = "direct-incoming";
export interface PortablePluginGenerationRecoveryContribution {
    readonly mode: "long-running-operation";
    readonly schema: "convax.generation-lro/1";
}
export interface PortablePluginGenerationModelContribution {
    readonly name: string;
    readonly tool: string;
}
export interface PortablePluginGenerationToolContribution {
    readonly acceptedInputs: readonly PortablePluginGenerationInputRole[];
    readonly delivery?: PortablePluginGenerationDelivery;
    readonly description: string;
    readonly id: string;
    readonly inputBinding?: PortablePluginGenerationInputBinding;
    readonly output: PortablePluginGenerationModality;
    readonly recovery?: PortablePluginGenerationRecoveryContribution;
    readonly title: string;
}
export interface PortablePluginGenerationContribution {
    readonly models: readonly PortablePluginGenerationModelContribution[];
    readonly tools: readonly PortablePluginGenerationToolContribution[];
}
export interface PortablePluginAgentToolContribution {
    readonly id: string;
    readonly tool: string;
}
export interface PortablePluginAgentRemoteMcpContribution {
    readonly headers?: Readonly<Record<string, string>>;
    readonly oauth: "auto" | "none";
    readonly type: "remote";
    readonly url: string;
}
export interface PortablePluginAgentContribution {
    readonly mcp?: PortablePluginAgentRemoteMcpContribution;
    readonly tools?: readonly PortablePluginAgentToolContribution[];
}
export declare function parsePortablePluginGenerationContribution(value: unknown): PortablePluginGenerationContribution;
export declare function parsePortablePluginAgentContribution(value: unknown): PortablePluginAgentContribution;
export declare function validatePortableToolReferences(input: {
    readonly agent?: PortablePluginAgentContribution;
    readonly generation?: PortablePluginGenerationContribution;
    readonly selectionActions?: readonly PortablePluginCanvasSelectionActionContribution[];
}): void;
//# sourceMappingURL=generation.d.ts.map
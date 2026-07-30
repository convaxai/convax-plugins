import { type PortablePluginUiCommand, type PortablePluginUiMenuItem, type PortablePluginUiToolbarItem } from "./ui";
export interface PortablePluginCanvasRendererContribution {
    readonly create?: boolean;
    readonly extensions?: readonly string[];
    readonly height?: number;
    readonly mimeTypes?: readonly string[];
    readonly nodeKinds?: readonly string[];
    readonly width?: number;
}
export interface PortablePluginLocalizedText {
    readonly default: string;
    readonly "zh-CN"?: string;
}
export type PortablePluginCanvasSelectionActionEditor = "time-point" | "time-range" | "crop-region" | "confirmation" | "immediate";
export interface PortablePluginCanvasSelectionActionStep {
    readonly tool: string;
}
export interface PortablePluginCanvasGenerationSelectionActionContribution {
    readonly description: PortablePluginLocalizedText;
    readonly editor: PortablePluginCanvasSelectionActionEditor;
    readonly id: string;
    /**
     * Host-owned visual treatment for an exact immediate image operation. This
     * is presentation metadata, never a provider identity or execution grant.
     */
    readonly presentation?: "cutout-scan";
    readonly steps: readonly PortablePluginCanvasSelectionActionStep[];
    readonly target: "image" | "video";
    readonly title: PortablePluginLocalizedText;
}
export interface PortablePluginCanvasMaterializeSelectionActionContribution {
    readonly action: {
        readonly connect: "selection-to-created";
        readonly type: "materialize-own-plugin-node";
    };
    readonly description: PortablePluginLocalizedText;
    readonly id: string;
    readonly target: "video";
    readonly title: PortablePluginLocalizedText;
}
export type PortablePluginCanvasSelectionActionContribution = PortablePluginCanvasGenerationSelectionActionContribution | PortablePluginCanvasMaterializeSelectionActionContribution;
export interface PortablePluginCanvasContribution {
    readonly commands?: readonly PortablePluginUiCommand[];
    readonly menus?: readonly PortablePluginUiMenuItem[];
    readonly renderer?: PortablePluginCanvasRendererContribution;
    readonly selectionActions?: readonly PortablePluginCanvasSelectionActionContribution[];
    readonly toolbar?: readonly PortablePluginUiToolbarItem[];
}
export declare function parsePortablePluginCanvasContribution(value: unknown): PortablePluginCanvasContribution;
//# sourceMappingURL=canvas.d.ts.map
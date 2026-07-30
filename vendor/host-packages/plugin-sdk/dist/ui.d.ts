/**
 * Host-rendered icon names. Plugins never contribute React components, SVG,
 * HTML, URLs, or platform-native icon names.
 */
export declare const portablePluginUiIconTokens: readonly ["download", "edit", "open", "play", "refresh", "settings", "sparkles", "upload"];
export type PortablePluginUiIconToken = (typeof portablePluginUiIconTokens)[number];
export interface PortablePluginUiLocalizedText {
    readonly default: string;
    readonly "zh-CN"?: string;
}
/**
 * A command can only deliver one bounded opaque message to its owning
 * sandboxed renderer. It cannot name a Host function or another Plugin.
 */
export interface PortablePluginUiRendererMessageTarget {
    readonly message: string;
    readonly type: "renderer-message";
}
export interface PortablePluginUiCommand {
    readonly icon?: PortablePluginUiIconToken;
    readonly id: string;
    readonly target: PortablePluginUiRendererMessageTarget;
    readonly title: PortablePluginUiLocalizedText;
}
export interface PortablePluginUiToolbarItem {
    /** Plugin-local command id. All presentation comes from the command. */
    readonly command: string;
    /** Stable placement identity, distinct from the command id. */
    readonly id: string;
    readonly order?: number;
}
export interface PortablePluginUiMenuItem {
    /** Plugin-local command id. All presentation comes from the command. */
    readonly command: string;
    /** Optional stable visual grouping token interpreted only by the Host. */
    readonly group?: string;
    /** Stable placement identity, distinct from the command id. */
    readonly id: string;
    readonly order?: number;
    /** Plugin UI menus are restricted to the owning Canvas node overflow. */
    readonly placement: "overflow";
}
export interface PortablePluginCanvasUiContribution {
    readonly commands: readonly PortablePluginUiCommand[];
    readonly menus: readonly PortablePluginUiMenuItem[];
    readonly toolbar: readonly PortablePluginUiToolbarItem[];
}
/**
 * Parses only the portable command and owning-node placement section of a
 * Canvas contribution. The canonical manifest parser supplies these three
 * fields; renderer and domain action contributions remain separate contracts.
 */
export declare function parsePortablePluginCanvasUiContribution(value: unknown): PortablePluginCanvasUiContribution;
//# sourceMappingURL=ui.d.ts.map
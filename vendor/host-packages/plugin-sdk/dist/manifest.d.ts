import { type PluginApiDeclaration } from "@convax/plugin-api";
import { type PortablePluginCanvasContribution } from "./canvas";
import { type PluginCapabilityDeclaration } from "./capabilities";
import { type PortablePluginAgentContribution, type PortablePluginGenerationContribution } from "./generation";
import { type PortablePluginLlmContribution, type PortablePluginMcpStdioRuntime, type PortablePluginPetContribution, type PortablePluginServiceContribution } from "./runtime-contributions";
import { type PortablePluginSkillContribution } from "./skills";
export declare const portablePluginManifestV8Schema: "convax.plugin/8";
export declare const portablePluginManifestFileName: "manifest.json";
export declare const portablePluginCapabilities: readonly ["canvas.connectedImages.read", "canvas.connectedInputs.read", "canvas.connectedMedia.stream", "canvas.node.read", "canvas.node.write", "canvas.image.write", "project.files.read", "agent.prompt", "generation.execute", "ui.fullscreen", "projects.read", "canvas.catalog.read", "canvas.document.read", "canvas.document.write", "canvas.events.subscribe", "pet.activity.read", "pet.activity.open", "pet.preferences.write", "pet.custom.manage"];
export type PortablePluginCapability = (typeof portablePluginCapabilities)[number];
export declare const portablePluginProjectCanvasCapabilities: readonly ["projects.read", "canvas.catalog.read", "canvas.document.read", "canvas.document.write", "canvas.events.subscribe"];
export declare const portablePluginPetCapabilities: readonly ["pet.activity.read", "pet.activity.open", "pet.preferences.write", "pet.custom.manage"];
export interface PortablePluginContributions {
    readonly agent?: PortablePluginAgentContribution;
    readonly capabilities?: PluginCapabilityDeclaration;
    readonly canvas?: PortablePluginCanvasContribution;
    readonly generation?: PortablePluginGenerationContribution;
    readonly llm?: PortablePluginLlmContribution;
    readonly pet?: PortablePluginPetContribution;
    readonly service?: PortablePluginServiceContribution;
    readonly skills?: readonly PortablePluginSkillContribution[];
}
export interface PortablePluginManifestV8 {
    readonly capabilities: readonly PortablePluginCapability[];
    readonly contributes: PortablePluginContributions;
    readonly description: string;
    readonly entry?: string;
    readonly hooks?: string;
    readonly hostApi: PluginApiDeclaration<string>;
    readonly id: string;
    readonly name: string;
    readonly runtime?: PortablePluginMcpStdioRuntime;
    readonly schema: typeof portablePluginManifestV8Schema;
    readonly version: string;
}
export interface ParsePortablePluginManifestV8Options {
    /**
     * Authoring rejects syntactically valid future Host API ids as likely typos.
     * Runtime preserves them so an older Host can report structured availability.
     */
    readonly hostApiMode?: "authoring" | "runtime";
}
/**
 * Canonical authoring and runtime parser for the complete convax.plugin/8
 * portable ABI. Host state, installed identity, grants and filesystem checks
 * are deliberately outside this pure boundary.
 */
export declare function parsePortablePluginManifestV8(value: unknown, options?: ParsePortablePluginManifestV8Options): PortablePluginManifestV8;
/**
 * Stable authoring entrypoint for Plugin repositories and Marketplace tooling.
 * Unknown Host API ids fail here as likely authoring mistakes.
 */
export type ParsedPortablePluginManifestV8<Manifest extends PortablePluginManifestV8> = Omit<PortablePluginManifestV8, "contributes" | "hostApi"> & {
    readonly contributes: Omit<PortablePluginContributions, "capabilities"> & {
        readonly capabilities?: Manifest["contributes"] extends {
            readonly capabilities: infer Capabilities extends PluginCapabilityDeclaration;
        } ? Capabilities : never;
    };
    readonly hostApi: Manifest["hostApi"];
};
export declare function parsePluginManifestV8<const Manifest extends PortablePluginManifestV8>(value: Manifest): ParsedPortablePluginManifestV8<Manifest>;
export declare function parsePluginManifestV8(value: unknown): PortablePluginManifestV8;
export { comparePortablePluginVersions, parsePortablePluginId, parsePortablePluginRelativePath, validatePortablePluginSegment, } from "./primitives";
//# sourceMappingURL=manifest.d.ts.map
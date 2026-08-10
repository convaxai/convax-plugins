export declare const portablePluginServiceActions: readonly ["authorize", "reauthorize", "authorization.cancel", "checkout", "sign_out"];
export type PortablePluginServiceAction = (typeof portablePluginServiceActions)[number];
export interface PortablePluginServiceContribution {
    readonly actions: readonly PortablePluginServiceAction[];
}
export interface PortablePluginLlmModelContribution {
    readonly id: string;
    readonly name: string;
}
export interface PortablePluginLlmContribution {
    readonly models: readonly PortablePluginLlmModelContribution[];
    readonly provider: {
        readonly id: string;
        readonly name: string;
        readonly protocol: "openai" | "openrouter";
    };
}
export interface PortablePluginPetContribution {
    readonly library: string;
    readonly overlay: string;
    readonly protocol: "convax.pet-host/1";
    readonly settings: string;
}
export interface PortablePluginMcpStdioRuntime {
    readonly args?: readonly string[];
    readonly command: string;
    readonly type: "mcp-stdio";
}
export declare function parsePortablePluginServiceContribution(value: unknown): PortablePluginServiceContribution;
export declare function parsePortablePluginLlmContribution(value: unknown): PortablePluginLlmContribution;
export declare function parsePortablePluginPetContribution(value: unknown): PortablePluginPetContribution;
export declare function parsePortablePluginRuntime(value: unknown): PortablePluginMcpStdioRuntime;
//# sourceMappingURL=runtime-contributions.d.ts.map
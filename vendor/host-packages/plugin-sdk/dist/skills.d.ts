import { type PluginApiDeclaration } from "@convax/plugin-api";
import type { PortablePluginAgentContribution } from "./generation";
export interface PortablePluginSkillUses {
    readonly optionalHostApis?: readonly string[];
    readonly pluginTools?: readonly string[];
    readonly requiredHostApis?: readonly string[];
}
export interface PortablePluginSkillContribution {
    readonly name: string;
    readonly path: string;
    readonly uses?: PortablePluginSkillUses;
}
export declare function parsePortablePluginSkills(value: unknown, hostApi: PluginApiDeclaration<string>): readonly PortablePluginSkillContribution[] | undefined;
export declare function validatePortableSkillToolReferences(skills: readonly PortablePluginSkillContribution[] | undefined, agent: PortablePluginAgentContribution | undefined): void;
//# sourceMappingURL=skills.d.ts.map
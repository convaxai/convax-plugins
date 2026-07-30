export type MarketplaceReleaseIdentity = {
    kind: "plugin" | "skill" | "mcp-server";
    id: string;
    version: string;
};
export declare function releaseTagForPackage(entry: MarketplaceReleaseIdentity): string;
//# sourceMappingURL=release.d.ts.map
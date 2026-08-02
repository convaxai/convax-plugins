import { type MarketplaceDescriptor, type RegistryPackage, type RegistryV2, type ShowcaseAsset, type ShowcaseV2 } from "@convax/marketplace";
export declare const MARKETPLACE_SELECTION_CONTEXT_SCHEMA: "convax.marketplace-selection-context/1";
export type MarketplaceSelectionContext = {
    schema: typeof MARKETPLACE_SELECTION_CONTEXT_SCHEMA;
    descriptor: MarketplaceDescriptor;
    selectedPackages: Array<{
        kind: RegistryPackage["kind"];
        id: string;
        version: string;
        sourcePreviousVersion?: string;
        productionPreviousVersion?: string;
        releaseTag: string;
    }>;
    removedPackages?: Array<{
        kind: RegistryPackage["kind"];
        id: string;
        productionVersion: string;
    }>;
    baseline: {
        mode: "v2";
        registry: RegistryV2;
        showcase: ShowcaseV2;
    };
};
export declare function packageIdentity(entry: {
    kind: string;
    id: string;
}): string;
export declare function parsePublishIdentities(value: readonly string[] | undefined): string[] | undefined;
export declare function parseMarketplaceSelectionContext(value: unknown, descriptor: MarketplaceDescriptor): MarketplaceSelectionContext;
export declare function selectionBaselineRegistry(context: MarketplaceSelectionContext, _descriptor: MarketplaceDescriptor): RegistryV2;
export declare function mergeSelectedRegistry(baselineValue: RegistryV2, candidateValue: RegistryV2, selectedIdentitiesValue: readonly string[], removedIdentitiesValue?: readonly string[]): RegistryV2;
export declare function inheritedShowcasePackages(context: MarketplaceSelectionContext, descriptor: MarketplaceDescriptor, registry: RegistryV2): Array<{
    package: ShowcaseV2["packages"][number];
    sources: Array<{
        source: ShowcaseAsset;
        targetUrl: string;
    }>;
}>;
export declare function assertSelectiveMarketplaceClosure(options: {
    context: MarketplaceSelectionContext;
    descriptor: MarketplaceDescriptor;
    registry: RegistryV2;
    showcase: ShowcaseV2;
}): {
    inheritedIdentities: Set<string>;
};
//# sourceMappingURL=selective.d.ts.map
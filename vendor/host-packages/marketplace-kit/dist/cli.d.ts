#!/usr/bin/env node
export declare function runMarketplaceCli(args?: string[], adapters?: {
    fetchArtifact?: (artifact: {
        url: string;
        size: number;
        sha256: string;
    }) => Promise<Uint8Array>;
}): Promise<void>;
//# sourceMappingURL=cli.d.ts.map
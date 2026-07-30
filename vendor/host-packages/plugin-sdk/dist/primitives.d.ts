export declare function portableRecord(value: unknown, label: string): Record<string, unknown>;
export declare function assertPortableKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void;
export declare function portableText(value: unknown, label: string, maximum: number): string;
export declare function portableArray(value: unknown, label: string, maximum: number, nonEmpty?: boolean): unknown[];
export declare function deepFreezePortable<T>(value: T): T;
export declare function parsePortablePluginVersion(value: unknown): string;
/** Compares two validated Plugin SemVer values using SemVer precedence. */
export declare function comparePortablePluginVersions(left: string, right: string): 1 | 0 | -1;
export declare function validatePortablePluginSegment(value: string): string;
export declare function parsePortablePluginId(value: unknown): string;
/** Validate a portable POSIX path without repairing or normalizing caller input. */
export declare function parsePortablePluginRelativePath(value: unknown, label?: string): string;
export declare function parsePortableStringArray(value: unknown, label: string, validate: (item: string) => string): readonly string[] | undefined;
export declare function parsePortableStableId(value: unknown, label: string, maximum?: number): string;
//# sourceMappingURL=primitives.d.ts.map
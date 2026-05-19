export type VendorEntry = {
    readonly sourceAbsolutePath: string;
    readonly targetRelativePath: string;
    readonly isExecutable: boolean;
};

export function applyPrefixToVendorEntry(prefix: string, entry: VendorEntry): VendorEntry {
    return {
        sourceAbsolutePath: entry.sourceAbsolutePath,
        targetRelativePath: `${prefix}/${entry.targetRelativePath}`,
        isExecutable: entry.isExecutable
    };
}

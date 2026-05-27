import type { ExcludedFile, IncludedFile } from '../../progress/progress-broadcaster.ts';

export type ScanInspectionInput = {
    readonly contents: readonly { readonly fileDescription: { readonly sourceFilePath: string } }[];
    readonly externalDependencies: ReadonlyMap<string, unknown>;
};

export type ScanInspectionResult = {
    readonly included: readonly IncludedFile[];
    readonly excluded: readonly ExcludedFile[];
};

export function inspectScanResults(bundle: ScanInspectionInput): ScanInspectionResult {
    const included: IncludedFile[] = bundle.contents.map((entry) => {
        return {
            path: entry.fileDescription.sourceFilePath,
            reason: 'reachable-from-entry'
        };
    });
    const excluded: ExcludedFile[] = Array.from(bundle.externalDependencies.keys(), (specifier) => {
        return {
            specifier,
            reason: 'external-module'
        };
    });
    return { included, excluded };
}

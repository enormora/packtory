import type { ExcludedFile, IncludedFile } from '../../progress/progress-broadcaster.ts';

type ResolvedBundleLike = {
    readonly contents: readonly { readonly fileDescription: { readonly sourceFilePath: string } }[];
    readonly externalDependencies: ReadonlyMap<string, unknown>;
};

export function inspectScanResults(bundle: ResolvedBundleLike): {
    readonly included: readonly IncludedFile[];
    readonly excluded: readonly ExcludedFile[];
} {
    const included: IncludedFile[] = bundle.contents.map((entry) => {
        return { path: entry.fileDescription.sourceFilePath, reason: 'reachable-from-entry' };
    });
    const excluded: ExcludedFile[] = Array.from(bundle.externalDependencies.keys(), (specifier) => {
        return { specifier, reason: 'external-module' };
    });
    return { included, excluded };
}

import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';

export type OwnerInfo = {
    readonly bundleName: string;
    readonly survivingBindings: ReadonlySet<string>;
};

export function collectFileOwnership(
    bundles: readonly Pick<AnalyzedBundle, 'contents' | 'name'>[]
): Map<string, OwnerInfo[]> {
    const ownership = new Map<string, OwnerInfo[]>();

    for (const bundle of bundles) {
        for (const resource of bundle.contents) {
            const filePath = resource.fileDescription.sourceFilePath;
            const owners = ownership.get(filePath) ?? [];
            owners.push({
                bundleName: bundle.name,
                survivingBindings: resource.analysis.survivingBindings
            });
            ownership.set(filePath, owners);
        }
    }

    return ownership;
}

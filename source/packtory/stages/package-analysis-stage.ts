import type { DeadCodeEliminator } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { resolveDeadCodeEliminationByName } from '../options/dead-code-elimination-resolution.ts';
import { createResolvedPackage, type ResolvedPackage } from '../resolved-package.ts';
import type { LinkedPackage } from './package-resolution-stage.ts';

export type PackageAnalysisDependencies = {
    readonly deadCodeEliminator: DeadCodeEliminator;
};

function mergeSourceFilePaths(
    existing: ReadonlySet<string> | undefined,
    sourceFilePaths: ReadonlySet<string>
): Set<string> {
    const merged = new Set(existing);
    for (const sourceFilePath of sourceFilePaths) {
        merged.add(sourceFilePath);
    }
    return merged;
}

function withSubstitutionPublicModuleSourceFilePaths(
    sourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    packageName: string,
    sourceFilePaths: ReadonlySet<string>
): ReadonlyMap<string, ReadonlySet<string>> {
    const updated = new Map(sourceFilePathsByPackageName);
    updated.set(
        packageName,
        mergeSourceFilePaths(sourceFilePathsByPackageName.get(packageName), sourceFilePaths)
    );
    return updated;
}

function collectSubstitutionPublicModuleSourceFilePaths(
    linkedPackages: readonly LinkedPackage[]
): ReadonlyMap<string, ReadonlySet<string>> {
    let sourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>> = new Map();
    for (const linkedPackage of linkedPackages) {
        const substitutions = linkedPackage.linkedBundle.substitutedSourceFilePathsByPackageName;
        for (const [ packageName, sourceFilePaths ] of substitutions) {
            sourceFilePathsByPackageName = withSubstitutionPublicModuleSourceFilePaths(
                sourceFilePathsByPackageName,
                packageName,
                sourceFilePaths
            );
        }
    }
    return sourceFilePathsByPackageName;
}

function substitutionPublicModuleSourceFilePathsFor(
    sourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    packageName: string
): ReadonlySet<string> {
    return sourceFilePathsByPackageName.get(packageName) ?? new Set<string>();
}

export async function analyzeResolvedPackages(
    dependencies: PackageAnalysisDependencies,
    config: ValidConfigWithoutRegistryResult,
    linkedPackages: readonly LinkedPackage[]
): Promise<readonly ResolvedPackage[]> {
    const deadCodeEliminationByName = resolveDeadCodeEliminationByName(config);
    const publicSubstitutionPathsByName = collectSubstitutionPublicModuleSourceFilePaths(linkedPackages);
    const analyzedBundles = await dependencies.deadCodeEliminator.eliminate(
        linkedPackages.map(function (linkedPackage) {
            const deadCodeElimination = deadCodeEliminationByName.get(linkedPackage.name);
            if (!deadCodeEliminationByName.has(linkedPackage.name)) {
                throw new Error(`Missing dead-code elimination settings for package "${linkedPackage.name}"`);
            }
            return {
                bundle: linkedPackage.linkedBundle,
                transformationsEnabled: deadCodeElimination?.enabled ?? true,
                substitutionPublicModuleSourceFilePaths: substitutionPublicModuleSourceFilePathsFor(
                    publicSubstitutionPathsByName,
                    linkedPackage.name
                ),
                deadCodeElimination
            };
        })
    );

    return linkedPackages.map(function (linkedPackage, index) {
        const analyzedBundle = analyzedBundles[index];
        if (analyzedBundle === undefined) {
            throw new Error(`Analyzed bundle missing for package "${linkedPackage.name}"`);
        }
        return createResolvedPackage(linkedPackage.name, analyzedBundle, linkedPackage.resolveOptions);
    });
}

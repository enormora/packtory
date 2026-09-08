import type { DeadCodeEliminator } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { resolveDeadCodeEliminationByName } from '../options/dead-code-elimination-resolution.ts';
import { createResolvedPackage, type ResolvedPackage } from '../resolved-package.ts';
import type { LinkedPackage } from './package-resolution-stage.ts';

export type PackageAnalysisDependencies = {
    readonly deadCodeEliminator: DeadCodeEliminator;
};

function mergeInputFilePaths(
    existing: ReadonlySet<string> | undefined,
    inputFilePaths: ReadonlySet<string>
): Set<string> {
    const merged = new Set(existing);
    for (const inputFilePath of inputFilePaths) {
        merged.add(inputFilePath);
    }
    return merged;
}

function withSubstitutionPublicModuleInputFilePaths(
    inputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    packageName: string,
    inputFilePaths: ReadonlySet<string>
): ReadonlyMap<string, ReadonlySet<string>> {
    const updated = new Map(inputFilePathsByPackageName);
    updated.set(
        packageName,
        mergeInputFilePaths(inputFilePathsByPackageName.get(packageName), inputFilePaths)
    );
    return updated;
}

function collectSubstitutionPublicModuleInputFilePaths(
    linkedPackages: readonly LinkedPackage[]
): ReadonlyMap<string, ReadonlySet<string>> {
    let inputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>> = new Map();
    for (const linkedPackage of linkedPackages) {
        const substitutions = linkedPackage.linkedBundle.substitutedInputFilePathsByPackageName;
        for (const [ packageName, inputFilePaths ] of substitutions) {
            inputFilePathsByPackageName = withSubstitutionPublicModuleInputFilePaths(
                inputFilePathsByPackageName,
                packageName,
                inputFilePaths
            );
        }
    }
    return inputFilePathsByPackageName;
}

function substitutionPublicModuleInputFilePathsFor(
    inputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    packageName: string
): ReadonlySet<string> {
    return inputFilePathsByPackageName.get(packageName) ?? new Set<string>();
}

export async function analyzeResolvedPackages(
    dependencies: PackageAnalysisDependencies,
    config: ValidConfigWithoutRegistryResult,
    linkedPackages: readonly LinkedPackage[]
): Promise<readonly ResolvedPackage[]> {
    const deadCodeEliminationByName = resolveDeadCodeEliminationByName(config);
    const publicSubstitutionPathsByName = collectSubstitutionPublicModuleInputFilePaths(linkedPackages);
    const analyzedBundles = await dependencies.deadCodeEliminator.eliminate(
        linkedPackages.map(function (linkedPackage) {
            const deadCodeElimination = deadCodeEliminationByName.get(linkedPackage.name);
            if (!deadCodeEliminationByName.has(linkedPackage.name)) {
                throw new Error(`Missing dead-code elimination settings for package "${linkedPackage.name}"`);
            }
            return {
                bundle: linkedPackage.linkedBundle,
                transformationsEnabled: deadCodeElimination?.enabled ?? true,
                substitutionPublicModuleInputFilePaths: substitutionPublicModuleInputFilePathsFor(
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

import type { DeadCodeEliminator } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { resolveDeadCodeEliminationByName } from '../options/dead-code-elimination-resolution.ts';
import { createResolvedPackage, type ResolvedPackage } from '../resolved-package.ts';
import type { LinkedPackage } from './package-resolution-stage.ts';

export type PackageAnalysisDependencies = {
    readonly deadCodeEliminator: DeadCodeEliminator;
};

export async function analyzeResolvedPackages(
    dependencies: PackageAnalysisDependencies,
    config: ValidConfigWithoutRegistryResult,
    linkedPackages: readonly LinkedPackage[]
): Promise<readonly ResolvedPackage[]> {
    const deadCodeEliminationByName = resolveDeadCodeEliminationByName(config);
    const analyzedBundles = await dependencies.deadCodeEliminator.eliminate(
        linkedPackages.map(function (linkedPackage) {
            const deadCodeElimination = deadCodeEliminationByName.get(linkedPackage.name);
            if (!deadCodeEliminationByName.has(linkedPackage.name)) {
                throw new Error(`Missing dead-code elimination settings for package "${linkedPackage.name}"`);
            }
            return {
                bundle: linkedPackage.linkedBundle,
                transformationsEnabled: deadCodeElimination?.enabled ?? true,
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

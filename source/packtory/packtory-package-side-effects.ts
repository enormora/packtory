import path from 'node:path';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { isRuntimeCodeTargetPath } from '../dead-code-eliminator/liveness/runtime-code.ts';
import type { PackageAnalysisDependencies } from './stages/package-analysis-stage.ts';
import type { PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import { inspectResolvedPackageFor } from './packtory-package-inspection.ts';
import type {
    GeneratedPackageSideEffectsDecision,
    PackageSideEffectsFile,
    PackageSideEffectsInspection,
    PackageSideEffectsInspectionResult
} from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';

type PackageSideEffectsInspectionDependencies = PackageAnalysisDependencies & PackageResolutionDependencies & {
    readonly repositoryFolder: string;
};

function sourcePath(repositoryFolder: string, sourceFilePath: string): string {
    return path.relative(repositoryFolder, sourceFilePath).split(path.sep).join(path.posix.sep);
}

function packagePath(targetFilePath: string): string {
    return `./${targetFilePath}`;
}

function generatedSideEffectsDecision(bundle: AnalyzedBundle): GeneratedPackageSideEffectsDecision {
    if (bundle.sideEffectsField === false) {
        return { type: 'side-effects-false' };
    }

    if (Array.isArray(bundle.sideEffectsField)) {
        return { type: 'side-effects-list', paths: Array.from(bundle.sideEffectsField) };
    }

    return { type: 'side-effects-omitted', reason: 'every-runtime-file-has-side-effects' };
}

function sideEffectsDecision(target: ResolvedPackage): PackageSideEffectsInspection['packageJsonDecision'] {
    const generated = generatedSideEffectsDecision(target.analyzedBundle);
    const additionalAttributes = target.resolveOptions.additionalPackageJsonAttributes;
    if (!Object.hasOwn(additionalAttributes, 'sideEffects')) {
        return generated;
    }

    return {
        type: 'user-provided-side-effects',
        providedValue: additionalAttributes.sideEffects,
        generated
    };
}

function impureFiles(target: ResolvedPackage, repositoryFolder: string): readonly PackageSideEffectsFile[] {
    return target
        .analyzedBundle
        .contents
        .filter(function (resource) {
            const { targetFilePath } = resource.fileDescription;
            return (
                isRuntimeCodeTargetPath(targetFilePath) &&
                resource.analysis.sideEffectStatements.length > 0
            );
        })
        .map(function (resource) {
            return {
                sourcePath: sourcePath(repositoryFolder, resource.fileDescription.sourceFilePath),
                packagePath: packagePath(resource.fileDescription.targetFilePath),
                statements: resource.analysis.sideEffectStatements
            };
        })
        .toSorted(function (left, right) {
            return left.packagePath.localeCompare(right.packagePath);
        });
}

function inspectResolvedPackage(
    dependencies: PackageSideEffectsInspectionDependencies,
    target: ResolvedPackage
): PackageSideEffectsInspection {
    return {
        packageName: target.name,
        packageJsonDecision: sideEffectsDecision(target),
        impureFiles: impureFiles(target, dependencies.repositoryFolder)
    };
}

export function createInspectPackageSideEffectsValidated(
    dependencies: PackageSideEffectsInspectionDependencies
): (
    validated: ValidConfigWithoutRegistryResult,
    packageName: string
) => Promise<PackageSideEffectsInspectionResult> {
    return async function inspectPackageSideEffectsValidated(validated, packageName) {
        return await inspectResolvedPackageFor(dependencies, validated, packageName, function (target) {
            return inspectResolvedPackage(dependencies, target);
        });
    };
}

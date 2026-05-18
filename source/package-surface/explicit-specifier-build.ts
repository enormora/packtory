import type { BundleLike, ExplicitPackageInterface, ExplicitSurface } from './package-shape.ts';
import { getRoot, isMatchingRootSourcePath } from './root-registry.ts';
import { toPackageSpecifier } from './specifier-syntax.ts';

type ExplicitBuildBundle = Pick<BundleLike, 'name' | 'roots'>;
type ModuleEntries = readonly NonNullable<ExplicitPackageInterface['modules']>[number][];

function getMatchingExplicitModules(
    bundle: ExplicitBuildBundle,
    packageInterface: ExplicitPackageInterface,
    sourceFilePath: string
): ModuleEntries {
    return (packageInterface.modules ?? []).filter((entry) => {
        return isMatchingRootSourcePath(getRoot(bundle, entry.root), sourceFilePath);
    });
}

function isShorterExportKey(candidate: string, current: string): boolean {
    return candidate.length < current.length;
}

function selectPreferredExportKey(modules: ModuleEntries): string | undefined {
    const [firstMatch, ...remainingMatches] = modules;
    if (firstMatch === undefined) {
        return undefined;
    }

    let bestMatch = firstMatch.export;
    for (const entry of remainingMatches) {
        if (isShorterExportKey(entry.export, bestMatch)) {
            bestMatch = entry.export;
        }
    }
    return bestMatch;
}

export function getExplicitPublicModuleSpecifier(
    bundle: ExplicitBuildBundle,
    surface: ExplicitSurface,
    sourceFilePath: string
): string | undefined {
    const exportKey = selectPreferredExportKey(
        getMatchingExplicitModules(bundle, surface.packageInterface, sourceFilePath)
    );
    return exportKey === undefined ? undefined : toPackageSpecifier(bundle.name, exportKey);
}

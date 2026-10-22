import type { ValidConfigurationWithoutRegistryResult } from '../configuration/validation.ts';
import type { BundleSymbolInspection, SymbolEliminationInspector } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { PackageResolutionDependencies } from './stages/package-resolution-stage.ts';
import { inspectResolvedPackageFor } from './packtory-package-inspection.ts';
import type { PackageSymbolInspectionResult } from './packtory-results.ts';

type PackageSymbolInspectionDependencies = PackageResolutionDependencies & {
    readonly inspectSymbols: SymbolEliminationInspector;
};

export function createInspectPackageSymbolsValidated(
    dependencies: PackageSymbolInspectionDependencies
): (validated: ValidConfigurationWithoutRegistryResult, packageName: string) => Promise<PackageSymbolInspectionResult> {
    return async function inspectPackageSymbolsValidated(validated, packageName) {
        const inspected = new Map<string, BundleSymbolInspection>();
        return inspectResolvedPackageFor(
            {
                ...dependencies,
                deadCodeEliminator: {
                    async eliminate(inputs) {
                        const inspections = await dependencies.inspectSymbols(inputs);
                        for (const inspection of inspections) {
                            inspected.set(inspection.bundle.name, inspection);
                        }
                        return inspections.map(function (inspection) {
                            return inspection.bundle;
                        });
                    }
                }
            },
            validated,
            packageName,
            function (target) {
                return {
                    packageName: target.name,
                    symbols: Array
                        .from(inspected.values())
                        .filter(function (inspection) {
                            return inspection.bundle.name === target.name;
                        })
                        .flatMap(function (inspection) {
                            return inspection.symbols;
                        })
                };
            }
        );
    };
}

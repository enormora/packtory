import {
    resolveDeadCodeEliminationSettings,
    type DeadCodeEliminationSettings
} from '../../configuration/dead-code-elimination-settings.ts';
import type { ValidConfigurationWithoutRegistryResult } from '../../configuration/validation.ts';

export function resolveDeadCodeEliminationByName(
    validated: ValidConfigurationWithoutRegistryResult
): ReadonlyMap<string, DeadCodeEliminationSettings | undefined> {
    const commonSettings = validated.packtoryConfiguration.commonPackageSettings?.deadCodeElimination;
    return new Map(
        validated.packtoryConfiguration.packages.map(function (packageConfiguration) {
            return [
                packageConfiguration.name,
                resolveDeadCodeEliminationSettings(packageConfiguration.deadCodeElimination, commonSettings)
            ];
        })
    );
}

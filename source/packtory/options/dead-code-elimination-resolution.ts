import {
    resolveDeadCodeEliminationSettings,
    type DeadCodeEliminationSettings
} from '../../config/dead-code-elimination-settings.ts';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';

export function resolveDeadCodeEliminationByName(
    validated: ValidConfigWithoutRegistryResult
): ReadonlyMap<string, DeadCodeEliminationSettings | undefined> {
    const commonSettings = validated.packtoryConfig.commonPackageSettings?.deadCodeElimination;
    return new Map(
        validated.packtoryConfig.packages.map((packageConfig) => {
            return [
                packageConfig.name,
                resolveDeadCodeEliminationSettings(packageConfig.deadCodeElimination, commonSettings)
            ];
        })
    );
}

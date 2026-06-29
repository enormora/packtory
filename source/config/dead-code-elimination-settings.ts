import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const pureImportTrustSchema = z.readonly(
    z.strictObject({
        from: nonEmptyStringSchema,
        imports: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
    })
);

export const deadCodeEliminationSettingsSchema = z.readonly(
    z.strictObject({
        enabled: z.boolean(),
        pureImports: z.optional(z.readonly(z.array(pureImportTrustSchema))),
        pureConstructors: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
    })
);

export type DeadCodeEliminationSettings = z.infer<typeof deadCodeEliminationSettingsSchema>;

function mergeOptionalSetting<T>(packageSetting: T | undefined, commonSetting: T | undefined): T | undefined {
    return packageSetting ?? commonSetting;
}

function resolveEnabledSetting(
    packageSettings: DeadCodeEliminationSettings | undefined,
    commonSettings: DeadCodeEliminationSettings | undefined
): boolean {
    if (packageSettings?.enabled !== undefined) {
        return packageSettings.enabled;
    }
    if (commonSettings?.enabled !== undefined) {
        return commonSettings.enabled;
    }
    return true;
}

function areDeadCodeEliminationSettingsMissing(
    packageSettings: DeadCodeEliminationSettings | undefined,
    commonSettings: DeadCodeEliminationSettings | undefined
): boolean {
    return packageSettings === undefined && commonSettings === undefined;
}

export function resolveDeadCodeEliminationSettings(
    packageSettings: DeadCodeEliminationSettings | undefined,
    commonSettings: DeadCodeEliminationSettings | undefined
): DeadCodeEliminationSettings | undefined {
    if (areDeadCodeEliminationSettingsMissing(packageSettings, commonSettings)) {
        return undefined;
    }

    return {
        enabled: resolveEnabledSetting(packageSettings, commonSettings),
        pureImports: mergeOptionalSetting(packageSettings?.pureImports, commonSettings?.pureImports),
        pureConstructors: mergeOptionalSetting(packageSettings?.pureConstructors, commonSettings?.pureConstructors)
    };
}

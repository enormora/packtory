import { z } from 'zod/mini';
import type { RegistrySettings } from './registry-settings.ts';
import { nonEmptyStringSchema } from './base-validations.ts';

export type VersionProviderInput = {
    readonly packageName: string;
    readonly currentVersion: string | undefined;
    readonly targetSourceFiles: readonly string[];
    readonly ignoredAttributionPaths: readonly string[];
    readonly registrySettings: RegistrySettings;
    readonly stage: boolean;
};

export type VersionProvider = (input: VersionProviderInput) => Promise<string> | string;
const pullRequestLabelsVersionSource = 'pull-request-labels';

type VersionSource = typeof pullRequestLabelsVersionSource;

type StaticManualVersioningSettings = {
    readonly automatic: false;
    readonly version: string;
};

type ProviderManualVersioningSettings = {
    readonly automatic: false;
    readonly provideVersion: VersionProvider;
};

export type SourceManualVersioningSettings = {
    readonly automatic: false;
    readonly source: VersionSource;
};

const staticManualVersioningSettingsSchema = z.readonly(
    z.strictObject({
        automatic: z.literal(false),
        version: nonEmptyStringSchema
    })
);

const providerManualVersioningSettingsSchema = z.readonly(
    z.strictObject({
        automatic: z.literal(false),
        provideVersion: z.custom<VersionProvider>((value) => {
            return typeof value === 'function';
        })
    })
);

const sourceManualVersioningSettingsSchema = z.readonly(
    z.strictObject({
        automatic: z.literal(false),
        source: z.literal(pullRequestLabelsVersionSource)
    })
);

export const manualVersioningSettingsSchema = z.readonly(
    z.union([
        staticManualVersioningSettingsSchema,
        providerManualVersioningSettingsSchema,
        sourceManualVersioningSettingsSchema
    ])
);

export type ManualVersioningSettings =
    | ProviderManualVersioningSettings
    | SourceManualVersioningSettings
    | StaticManualVersioningSettings;

export function validateManualVersion(version: unknown): string {
    const result = z.safeParse(nonEmptyStringSchema, version);
    if (!result.success) {
        throw new Error('Manual version provider must return a non-empty string');
    }
    return result.data;
}

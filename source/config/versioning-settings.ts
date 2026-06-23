import { z } from 'zod/mini';
import { automaticVersioningSettingsSchema } from './automatic-versioning-settings.ts';
import { manualVersioningSettingsSchema, type ManualVersioningSettings } from './manual-versioning-settings.ts';

export const versioningSettingsSchema = z.readonly(
    z.union([automaticVersioningSettingsSchema, manualVersioningSettingsSchema])
);

type AutomaticVersioningSettings = z.infer<typeof automaticVersioningSettingsSchema>;

export type VersioningSettings = AutomaticVersioningSettings | ManualVersioningSettings;

export function hasVersionProvider(
    versioning: VersioningSettings
): versioning is Extract<VersioningSettings, { readonly provideVersion: unknown }> {
    return 'provideVersion' in versioning;
}

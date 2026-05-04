import { z } from 'zod/mini';
import { automaticVersioningSettingsSchema } from './automatic-versioning-settings.ts';
import { manualVersioningSettingsSchema } from './manual-versioning-settings.ts';

export const versioningSettingsSchema = z.readonly(
    z.discriminatedUnion('automatic', [automaticVersioningSettingsSchema, manualVersioningSettingsSchema])
);

export type VersioningSettings = z.infer<typeof versioningSettingsSchema>;

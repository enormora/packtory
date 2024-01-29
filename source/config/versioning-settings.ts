import { type Schema, struct, literal, optional, union } from '@effect/schema/Schema';
import { type NoExpand, nonEmptyStringSchema } from './base-validations.js';

const $automaticVersioningSettingsSchema = struct({
    automatic: literal(true),
    minimumVersion: optional(nonEmptyStringSchema, { exact: true })
});
type AutomaticVersioningSettings = NoExpand<Schema.To<typeof $automaticVersioningSettingsSchema>>;
const automaticVersioningSettingsSchema: Schema<AutomaticVersioningSettings> = $automaticVersioningSettingsSchema;

const $manualVersioningSettingsSchema = struct({
    automatic: literal(false),
    version: nonEmptyStringSchema
});
type ManualVersioningSettings = NoExpand<Schema.To<typeof $manualVersioningSettingsSchema>>;
const manualVersioningSettingsSchema: Schema<ManualVersioningSettings> = $manualVersioningSettingsSchema;

const $versioningSettingsSchema = union(automaticVersioningSettingsSchema, manualVersioningSettingsSchema);
export type VersioningSettings = Schema.To<typeof $versioningSettingsSchema>;
export const versioningSettingsSchema: Schema<VersioningSettings> = $versioningSettingsSchema;

import { type Schema, struct } from '@effect/schema/Schema';
import { type NoExpand, nonEmptyStringSchema } from './base-validations.js';

const $registrySettingsSchema = struct({
    token: nonEmptyStringSchema
});

export type RegistrySettings = NoExpand<Schema.To<typeof $registrySettingsSchema>>;
export const registrySettingsSchema: Schema<RegistrySettings> = $registrySettingsSchema;

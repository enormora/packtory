import { type Schema, struct } from '@effect/schema/Schema';
import { type NoExpand, nonEmptyStringSchema } from './base-validations.js';

const $additionalFileDescriptionSchema = struct({
    sourceFilePath: nonEmptyStringSchema,
    targetFilePath: nonEmptyStringSchema
});

export type AdditionalFileDescription = NoExpand<Schema.To<typeof $additionalFileDescriptionSchema>>;

export const additionalFileDescriptionSchema: Schema<AdditionalFileDescription> = $additionalFileDescriptionSchema;

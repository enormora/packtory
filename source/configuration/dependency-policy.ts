import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

const dependencyPolicyFields = {
    allowMutableSpecifiers: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
};
export const dependencyPolicySchema = z.readonly(
    z.strictObject(dependencyPolicyFields)
);

export type DependencyPolicy = z.infer<typeof dependencyPolicySchema>;

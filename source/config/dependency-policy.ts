import { z } from 'zod/mini';
import { nonEmptyStringSchema } from './base-validations.ts';

export const dependencyPolicySchema = z.readonly(
    z.strictObject({
        allowMutableSpecifiers: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
    })
);

export type DependencyPolicy = z.infer<typeof dependencyPolicySchema>;

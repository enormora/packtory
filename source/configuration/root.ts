import { z } from 'zod/mini';
import type { PackageRoot } from '../common/package-root.ts';
import { isDeclarationCompanionFilePath } from '../common/declaration-companion-paths.ts';
import { nonEmptyStringSchema } from './base-validations.ts';

export const rootSchema: z.ZodMiniType<Root> = z.readonly(z.union([
    z.strictObject({ javaScript: nonEmptyStringSchema, declarationFile: z.optional(nonEmptyStringSchema) }),
    z.strictObject({ json: nonEmptyStringSchema.check(z.endsWith('.json')) }),
    z.strictObject({ declarationFile: nonEmptyStringSchema.check(z.refine(isDeclarationCompanionFilePath)) })
]));

export type Root = PackageRoot<string>;

import { z } from 'zod/mini';
import type { PackageRoot } from '../common/package-root.ts';
import { isDeclarationCompanionFilePath } from '../common/declaration-companion-paths.ts';
import { nonEmptyStringSchema } from './base-validations.ts';

const rootFields = { javaScript: nonEmptyStringSchema, declarationFile: z.optional(nonEmptyStringSchema) };
const jsonRootPathSchema = z.string().check(z.endsWith('.json'));
const declarationRootPathSchema = z.string().check(z.refine(isDeclarationCompanionFilePath));
const rootVariants = z.union([
    z.strictObject(rootFields),
    z.strictObject({ json: jsonRootPathSchema }),
    z.strictObject({ declarationFile: declarationRootPathSchema })
]);
export const rootSchema: z.ZodMiniType<Root> = z.readonly(rootVariants);

export type Root = PackageRoot<string>;

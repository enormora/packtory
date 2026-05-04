import { z } from 'zod/mini';
import { isForbiddenAdditionalPackageJsonAttributeName } from './package-json.ts';

const additionalPackageJsonAttributeNameSchema = z.string().check(
    z.refine((value) => {
        return !isForbiddenAdditionalPackageJsonAttributeName(value);
    })
);

export const additionalPackageJsonAttributesSchema = z.readonly(
    z.record(additionalPackageJsonAttributeNameSchema, z.json())
);

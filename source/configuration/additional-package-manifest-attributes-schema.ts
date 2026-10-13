import { z } from 'zod/mini';
import { isForbiddenAdditionalPackageManifestAttributeName } from './package-manifest.ts';

const additionalPackageManifestAttributeNameSchema = z.string().check(
    z.refine(function (value) {
        return !isForbiddenAdditionalPackageManifestAttributeName(value);
    })
);

export const additionalPackageManifestAttributesSchema = z.readonly(
    z.record(additionalPackageManifestAttributeNameSchema, z.json())
);

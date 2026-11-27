import { z } from 'zod/mini';
import { additionalFileDescriptionSchema, type AdditionalFileDescription } from './additional-files.ts';
import { additionalPackageManifestAttributesSchema } from './additional-package-manifest-attributes-schema.ts';
import {
    deadCodeEliminationSettingsSchema,
    type DeadCodeEliminationSettings
} from './dead-code-elimination-settings.ts';
import { dependencyPolicySchema, type DependencyPolicy } from './dependency-policy.ts';
import { publishSettingsSchema, type PublishSettings } from './publish-settings.ts';
import { nonEmptyStringSchema } from './base-validations.ts';
import type { AdditionalPackageManifestAttributes } from './package-manifest.ts';

export type OptionalPackageSettings = {
    readonly additionalChangelogSourceFiles?: readonly string[] | undefined;
    readonly additionalFiles?: readonly AdditionalFileDescription[] | undefined;
    readonly includeSourceMapFiles?: boolean | undefined;
    readonly additionalPackageManifestAttributes?: AdditionalPackageManifestAttributes | undefined;
    readonly publishSettings?: PublishSettings | undefined;
    readonly dependencyPolicy?: DependencyPolicy | undefined;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
};

const optionalPackageSettingsFields = {
    additionalChangelogSourceFiles: z.optional(z.readonly(z.array(nonEmptyStringSchema))),
    additionalFiles: z.optional(z.readonly(z.array(additionalFileDescriptionSchema))),
    includeSourceMapFiles: z.optional(z.boolean()),
    additionalPackageManifestAttributes: z.optional(additionalPackageManifestAttributesSchema),
    publishSettings: z.optional(publishSettingsSchema),
    dependencyPolicy: z.optional(dependencyPolicySchema),
    deadCodeElimination: z.optional(deadCodeEliminationSettingsSchema)
};
export const optionalPackageSettingsSchema = z.strictObject(optionalPackageSettingsFields);

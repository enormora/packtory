import { z } from 'zod/mini';
import { checkRuleSchemas } from '../checks/rules/registry.ts';

export const checksSchema = z.readonly(
    z.strictObject({
        typeScriptIntegrity: z.optional(checkRuleSchemas.typeScriptIntegrity.globalSchema),
        noDuplicatedFiles: z.optional(checkRuleSchemas.noDuplicatedFiles.globalSchema),
        requiredFiles: z.optional(checkRuleSchemas.requiredFiles.globalSchema),
        maximumBundleSize: z.optional(checkRuleSchemas.maximumBundleSize.globalSchema),
        noUnusedBundleDependencies: z.optional(checkRuleSchemas.noUnusedBundleDependencies.globalSchema),
        noDevelopmentDependencyImports: z.optional(checkRuleSchemas.noDevelopmentDependencyImports.globalSchema),
        uniqueTargetPaths: z.optional(checkRuleSchemas.uniqueTargetPaths.globalSchema),
        noSideEffects: z.optional(checkRuleSchemas.noSideEffects.globalSchema),
        noUnexposedExecutables: z.optional(checkRuleSchemas.noUnexposedExecutables.globalSchema),
        nodeEngineCompatibility: z.optional(checkRuleSchemas.nodeEngineCompatibility.globalSchema)
    })
);

export const checksPerPackageSchema = z.readonly(
    z.strictObject({
        typeScriptIntegrity: z.optional(checkRuleSchemas.typeScriptIntegrity.perPackageSchema),
        noDuplicatedFiles: z.optional(checkRuleSchemas.noDuplicatedFiles.perPackageSchema),
        requiredFiles: z.optional(checkRuleSchemas.requiredFiles.perPackageSchema),
        maximumBundleSize: z.optional(checkRuleSchemas.maximumBundleSize.perPackageSchema),
        noUnusedBundleDependencies: z.optional(checkRuleSchemas.noUnusedBundleDependencies.perPackageSchema),
        noDevelopmentDependencyImports: z.optional(checkRuleSchemas.noDevelopmentDependencyImports.perPackageSchema),
        uniqueTargetPaths: z.optional(checkRuleSchemas.uniqueTargetPaths.perPackageSchema),
        noSideEffects: z.optional(checkRuleSchemas.noSideEffects.perPackageSchema),
        noUnexposedExecutables: z.optional(checkRuleSchemas.noUnexposedExecutables.perPackageSchema),
        nodeEngineCompatibility: z.optional(checkRuleSchemas.nodeEngineCompatibility.perPackageSchema)
    })
);

export type ChecksSettings = z.infer<typeof checksSchema>;
export type PackageChecksSettings = z.infer<typeof checksPerPackageSchema>;

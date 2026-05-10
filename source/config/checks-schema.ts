import { z } from 'zod/mini';
import { maxBundleSizeRule } from '../checks/rules/max-bundle-size.ts';
import { noDevDependencyImportsRule } from '../checks/rules/no-dev-dependency-imports.ts';
import { noDuplicatedFilesRule } from '../checks/rules/no-duplicated-files.ts';
import { noSideEffectsRule } from '../checks/rules/no-side-effects.ts';
import { noUnusedBundleDependenciesRule } from '../checks/rules/no-unused-bundle-dependencies.ts';
import { requiredFilesRule } from '../checks/rules/required-files.ts';
import { uniqueTargetPathsRule } from '../checks/rules/unique-target-paths.ts';

export const checksSchema = z.strictObject({
    noDuplicatedFiles: z.optional(noDuplicatedFilesRule.globalSchema),
    requiredFiles: z.optional(requiredFilesRule.globalSchema),
    maxBundleSize: z.optional(maxBundleSizeRule.globalSchema),
    noUnusedBundleDependencies: z.optional(noUnusedBundleDependenciesRule.globalSchema),
    noDevDependencyImports: z.optional(noDevDependencyImportsRule.globalSchema),
    uniqueTargetPaths: z.optional(uniqueTargetPathsRule.globalSchema),
    noSideEffects: z.optional(noSideEffectsRule.globalSchema)
});

export const checksPerPackageSchema = z.strictObject({
    noDuplicatedFiles: z.optional(noDuplicatedFilesRule.perPackageSchema),
    requiredFiles: z.optional(requiredFilesRule.perPackageSchema),
    maxBundleSize: z.optional(maxBundleSizeRule.perPackageSchema),
    noUnusedBundleDependencies: z.optional(noUnusedBundleDependenciesRule.perPackageSchema),
    noDevDependencyImports: z.optional(noDevDependencyImportsRule.perPackageSchema),
    uniqueTargetPaths: z.optional(uniqueTargetPathsRule.perPackageSchema),
    noSideEffects: z.optional(noSideEffectsRule.perPackageSchema)
});

import { maxBundleSizeRule } from './max-bundle-size.ts';
import { noDevDependencyImportsRule } from './no-dev-dependency-imports.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';
import { noUnusedBundleDependenciesRule } from './no-unused-bundle-dependencies.ts';
import { requiredFilesRule } from './required-files.ts';
import { uniqueTargetPathsRule } from './unique-target-paths.ts';

export const allRules = [
    noDuplicatedFilesRule,
    requiredFilesRule,
    maxBundleSizeRule,
    noUnusedBundleDependenciesRule,
    noDevDependencyImportsRule,
    uniqueTargetPathsRule
] as const;

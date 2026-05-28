import { areTheTypesWrongRule } from './are-the-types-wrong.ts';
import { maxBundleSizeRule } from './max-bundle-size.ts';
import { noDevDependencyImportsRule } from './no-dev-dependency-imports.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';
import { noSideEffectsRule } from './no-side-effects.ts';
import { noUnusedBundleDependenciesRule } from './no-unused-bundle-dependencies.ts';
import { requiredFilesRule } from './required-files.ts';
import { uniqueTargetPathsRule } from './unique-target-paths.ts';

export const allRules = [
    areTheTypesWrongRule,
    noDuplicatedFilesRule,
    requiredFilesRule,
    maxBundleSizeRule,
    noUnusedBundleDependenciesRule,
    noDevDependencyImportsRule,
    uniqueTargetPathsRule,
    noSideEffectsRule
] as const;

import { maxBundleSizeRule } from './max-bundle-size.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';
import { noUnusedBundleDependenciesRule } from './no-unused-bundle-dependencies.ts';
import { requiredFilesRule } from './required-files.ts';

export const allRules = [
    noDuplicatedFilesRule,
    requiredFilesRule,
    maxBundleSizeRule,
    noUnusedBundleDependenciesRule
] as const;

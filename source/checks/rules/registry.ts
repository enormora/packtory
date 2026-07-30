import { maxBundleSizeRule } from './max-bundle-size.ts';
import { noDevDependencyImportsRule } from './no-dev-dependency-imports.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';
import { noSideEffectsRule } from './no-side-effects.ts';
import { noUnusedBundleDependenciesRule } from './no-unused-bundle-dependencies.ts';
import { requiredFilesRule } from './required-files.ts';
import {
    createTypeScriptIntegrityRule,
    type TypeScriptIntegrityDependencies,
    type TypeScriptIntegrityRule
} from './type-script-integrity.ts';
import { uniqueTargetPathsRule } from './unique-target-paths.ts';

export type CheckRuleDependencies = TypeScriptIntegrityDependencies;

export type AllCheckRules = readonly [
    TypeScriptIntegrityRule,
    typeof noDuplicatedFilesRule,
    typeof requiredFilesRule,
    typeof maxBundleSizeRule,
    typeof noUnusedBundleDependenciesRule,
    typeof noDevDependencyImportsRule,
    typeof uniqueTargetPathsRule,
    typeof noSideEffectsRule
];

export function createAllRules(dependencies: CheckRuleDependencies): AllCheckRules {
    return [
        createTypeScriptIntegrityRule(dependencies),
        noDuplicatedFilesRule,
        requiredFilesRule,
        maxBundleSizeRule,
        noUnusedBundleDependenciesRule,
        noDevDependencyImportsRule,
        uniqueTargetPathsRule,
        noSideEffectsRule
    ];
}

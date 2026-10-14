import {
    createNodeEngineCompatibilityRule,
    nodeEngineCompatibilitySchemas,
    type NodeEngineCompatibilityDependencies,
    type NodeEngineCompatibilityRule
} from './node-engine-compatibility.ts';
import { maxBundleSizeRule } from './max-bundle-size.ts';
import { noDevDependencyImportsRule } from './no-dev-dependency-imports.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';
import { noSideEffectsRule } from './no-side-effects.ts';
import { noUnexposedExecutablesRule } from './no-unexposed-executables.ts';
import { noUnusedBundleDependenciesRule } from './no-unused-bundle-dependencies.ts';
import { requiredFilesRule } from './required-files.ts';
import {
    createTypeScriptIntegrityRule,
    typeScriptIntegritySchemas,
    type TypeScriptIntegrityDependencies,
    type TypeScriptIntegrityRule
} from './type-script-integrity.ts';
import { uniqueTargetPathsRule } from './unique-target-paths.ts';

export const checkRuleSchemas = {
    typeScriptIntegrity: typeScriptIntegritySchemas,
    noDuplicatedFiles: noDuplicatedFilesRule,
    requiredFiles: requiredFilesRule,
    maxBundleSize: maxBundleSizeRule,
    noUnusedBundleDependencies: noUnusedBundleDependenciesRule,
    noDevDependencyImports: noDevDependencyImportsRule,
    uniqueTargetPaths: uniqueTargetPathsRule,
    noSideEffects: noSideEffectsRule,
    noUnexposedExecutables: noUnexposedExecutablesRule,
    nodeEngineCompatibility: nodeEngineCompatibilitySchemas
};

export type CheckRuleDependencies = NodeEngineCompatibilityDependencies & TypeScriptIntegrityDependencies;

export type AllCheckRules = readonly [
    TypeScriptIntegrityRule,
    typeof noDuplicatedFilesRule,
    typeof requiredFilesRule,
    typeof maxBundleSizeRule,
    typeof noUnusedBundleDependenciesRule,
    typeof noDevDependencyImportsRule,
    typeof uniqueTargetPathsRule,
    typeof noSideEffectsRule,
    typeof noUnexposedExecutablesRule,
    NodeEngineCompatibilityRule
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
        noSideEffectsRule,
        noUnexposedExecutablesRule,
        createNodeEngineCompatibilityRule(dependencies)
    ];
}

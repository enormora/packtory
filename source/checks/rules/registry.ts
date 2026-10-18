import {
    createNodeEngineCompatibilityRule,
    nodeEngineCompatibilitySchemas,
    type NodeEngineCompatibilityDependencies,
    type NodeEngineCompatibilityRule
} from './node-engine-compatibility.ts';
import { maximumBundleSizeRule } from './maximum-bundle-size.ts';
import { noDevelopmentDependencyImportsRule } from './no-development-dependency-imports.ts';
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
    maximumBundleSize: maximumBundleSizeRule,
    noUnusedBundleDependencies: noUnusedBundleDependenciesRule,
    noDevelopmentDependencyImports: noDevelopmentDependencyImportsRule,
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
    typeof maximumBundleSizeRule,
    typeof noUnusedBundleDependenciesRule,
    typeof noDevelopmentDependencyImportsRule,
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
        maximumBundleSizeRule,
        noUnusedBundleDependenciesRule,
        noDevelopmentDependencyImportsRule,
        uniqueTargetPathsRule,
        noSideEffectsRule,
        noUnexposedExecutablesRule,
        createNodeEngineCompatibilityRule(dependencies)
    ];
}

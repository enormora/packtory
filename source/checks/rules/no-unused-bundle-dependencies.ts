import type { z } from 'zod/mini';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type CheckRuleDefinition,
    type RulePackageConfig,
    type RuleRunParams
} from '../rule.ts';

const ruleName = 'noUnusedBundleDependencies';

type GlobalConfig = z.infer<typeof enabledOnlyGlobalSchema>;
type PerPackageConfig = z.infer<typeof emptyPerPackageSchema>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;

type DependencyKind = 'bundle' | 'bundle peer';

function findUnused(bundle: LinkedBundle, declared: readonly string[], kind: DependencyKind): readonly string[] {
    return declared
        .filter((dependencyName) => {
            return !bundle.linkedBundleDependencies.has(dependencyName);
        })
        .map((dependencyName) => {
            return `Unused ${kind} dependency "${dependencyName}" declared by package "${bundle.name}"`;
        });
}

function checkBundle(bundle: LinkedBundle, packageConfig: RulePackageConfig | undefined): readonly string[] {
    if (packageConfig === undefined) {
        return [];
    }
    return [
        ...findUnused(bundle, packageConfig.bundleDependencies ?? [], 'bundle'),
        ...findUnused(bundle, packageConfig.bundlePeerDependencies ?? [], 'bundle peer')
    ];
}

function run(params: RunParams): readonly string[] {
    const globalConfig = params.settings?.noUnusedBundleDependencies;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    return params.bundles.flatMap((bundle) => {
        return checkBundle(bundle, params.packageConfigs?.[bundle.name]);
    });
}

export const noUnusedBundleDependenciesRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema: enabledOnlyGlobalSchema,
    perPackageSchema: emptyPerPackageSchema,
    run
};

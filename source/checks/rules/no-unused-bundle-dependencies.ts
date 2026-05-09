import { z } from 'zod/mini';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import type { CheckRuleDefinition, RulePackageConfig, RuleRunParams } from '../rule.ts';

const ruleName = 'noUnusedBundleDependencies';

const globalSchema = z.strictObject({
    enabled: z.boolean()
});

const perPackageSchema = z.strictObject({});

type GlobalConfig = z.infer<typeof globalSchema>;
type PerPackageConfig = z.infer<typeof perPackageSchema>;
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
    globalSchema,
    perPackageSchema,
    run
};

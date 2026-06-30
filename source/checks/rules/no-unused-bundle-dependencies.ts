import type { z } from 'zod/mini';
import { bundledDependencyGroups } from '../../common/bundled-dependency-groups.ts';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type CheckRuleDefinition,
    type RulePackageConfig,
    type RuleRunParams
} from '../rule.ts';

const ruleName = 'noUnusedBundleDependencies';

type GlobalConfig = Readonly<z.infer<typeof enabledOnlyGlobalSchema>>;
type PerPackageConfig = Readonly<z.infer<typeof emptyPerPackageSchema>>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;
function checkBundle(bundle: AnalyzedBundle, packageConfig: RulePackageConfig | undefined): readonly string[] {
    const issues: string[] = [];

    for (const group of bundledDependencyGroups()) {
        const declaredDependencies = packageConfig?.[group.propertyName] ?? [];
        for (const dependencyName of declaredDependencies) {
            if (!bundle.linkedBundleDependencies.has(dependencyName)) {
                issues.push(
                    `Unused ${group.unusedLabel} dependency "${dependencyName}" declared by package "${bundle.name}"`
                );
            }
        }
    }

    return issues;
}

async function run(params: RunParams): Promise<readonly string[]> {
    const globalConfig = params.settings?.noUnusedBundleDependencies;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    return params.bundles.flatMap(function (bundle) {
        return checkBundle(bundle, params.packageConfigs?.[bundle.name]);
    });
}

export const noUnusedBundleDependenciesRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema: enabledOnlyGlobalSchema,
    perPackageSchema: emptyPerPackageSchema,
    run
};

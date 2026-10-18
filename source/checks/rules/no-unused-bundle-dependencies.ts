import type { z } from 'zod/mini';
import { bundledDependencyGroups } from '../../common/bundled-dependency-groups.ts';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type CheckRuleDefinition,
    type RulePackageConfiguration,
    type RuleRunInput
} from '../rule.ts';

const ruleName = 'noUnusedBundleDependencies';

type GlobalConfiguration = Readonly<z.infer<typeof enabledOnlyGlobalSchema>>;
type PerPackageConfiguration = Readonly<z.infer<typeof emptyPerPackageSchema>>;
type RunInput = RuleRunInput<typeof ruleName, GlobalConfiguration, PerPackageConfiguration>;
function checkBundle(
    bundle: AnalyzedBundle,
    packageConfiguration: RulePackageConfiguration | undefined
): readonly string[] {
    const issues: string[] = [];

    for (const group of bundledDependencyGroups()) {
        const declaredDependencies = packageConfiguration?.[group.propertyName] ?? [];
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

async function run(input: RunInput): Promise<readonly string[]> {
    const globalConfiguration = input.settings?.noUnusedBundleDependencies;
    if (globalConfiguration?.enabled !== true) {
        return [];
    }

    return input.bundles.flatMap(function (bundle) {
        return checkBundle(bundle, input.packageConfigurations?.[bundle.name]);
    });
}

export const noUnusedBundleDependenciesRule: CheckRuleDefinition<
    typeof ruleName,
    GlobalConfiguration,
    PerPackageConfiguration
> = {
    name: ruleName,
    globalSchema: enabledOnlyGlobalSchema,
    perPackageSchema: emptyPerPackageSchema,
    run
};

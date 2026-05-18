import { groupBy } from 'remeda';
import type { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type CheckRuleDefinition,
    type RuleRunParams
} from '../rule.ts';

const ruleName = 'uniqueTargetPaths';

type GlobalConfig = z.infer<typeof enabledOnlyGlobalSchema>;
type PerPackageConfig = z.infer<typeof emptyPerPackageSchema>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;

function findCollidingTargetPaths(bundle: AnalyzedBundle): readonly string[] {
    const sourcesByTarget = groupBy(bundle.contents, (resource) => {
        return resource.fileDescription.targetFilePath;
    });

    return Object.entries(sourcesByTarget).flatMap(([targetFilePath, resources]) => {
        if (resources.length <= 1) {
            return [];
        }
        const sortedSources = resources
            .map((resource) => {
                return resource.fileDescription.sourceFilePath;
            })
            .toSorted((left, right) => {
                return left.localeCompare(right);
            });
        return [`Package "${bundle.name}" maps multiple sources to "${targetFilePath}": ${sortedSources.join(', ')}`];
    });
}

function run(params: RunParams): readonly string[] {
    const globalConfig = params.settings?.uniqueTargetPaths;
    if (globalConfig?.enabled !== true) {
        return [];
    }

    return params.bundles.flatMap(findCollidingTargetPaths);
}

export const uniqueTargetPathsRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema: enabledOnlyGlobalSchema,
    perPackageSchema: emptyPerPackageSchema,
    run
};

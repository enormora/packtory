import type { z } from 'zod/mini';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
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

function findCollidingTargetPaths(bundle: LinkedBundle): readonly string[] {
    const sourcesByTarget = new Map<string, string[]>();
    for (const resource of bundle.contents) {
        const { targetFilePath, sourceFilePath } = resource.fileDescription;
        const sources = sourcesByTarget.get(targetFilePath) ?? [];
        sources.push(sourceFilePath);
        sourcesByTarget.set(targetFilePath, sources);
    }

    return Array.from(sourcesByTarget.entries()).flatMap(([targetFilePath, sources]) => {
        if (sources.length <= 1) {
            return [];
        }
        const sortedSources = sources.toSorted((left, right) => {
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

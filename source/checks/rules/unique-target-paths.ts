import { groupBy } from 'remeda';
import type { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type CheckRuleDefinition,
    type RuleRunInput
} from '../rule.ts';

const ruleName = 'uniqueTargetPaths';

type GlobalConfiguration = Readonly<z.infer<typeof enabledOnlyGlobalSchema>>;
type PerPackageConfiguration = Readonly<z.infer<typeof emptyPerPackageSchema>>;
type RunInput = RuleRunInput<typeof ruleName, GlobalConfiguration, PerPackageConfiguration>;

function findCollidingTargetPaths(bundle: AnalyzedBundle): readonly string[] {
    const sourcesByTarget = groupBy(bundle.contents, function (resource) {
        return resource.fileDescription.targetFilePath;
    });

    return Object.entries(sourcesByTarget).flatMap(function ([ targetFilePath, resources ]) {
        if (resources.length <= 1) {
            return [];
        }
        const sortedSources = resources
            .map(function (resource) {
                return resource.fileDescription.inputFilePath;
            })
            .toSorted(function (left, right) {
                return left.localeCompare(right);
            });
        return [ `Package "${bundle.name}" maps multiple sources to "${targetFilePath}": ${sortedSources.join(', ')}` ];
    });
}

async function run(input: RunInput): Promise<readonly string[]> {
    const globalConfiguration = input.settings?.uniqueTargetPaths;
    if (globalConfiguration?.enabled !== true) {
        return [];
    }

    return input.bundles.flatMap(findCollidingTargetPaths);
}

export const uniqueTargetPathsRule: CheckRuleDefinition<typeof ruleName, GlobalConfiguration, PerPackageConfiguration> =
    {
        name: ruleName,
        globalSchema: enabledOnlyGlobalSchema,
        perPackageSchema: emptyPerPackageSchema,
        run
    };

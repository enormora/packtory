import type { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    type CheckRuleDefinition,
    pathAllowListGlobalSchema,
    pathAllowListPerPackageSchema,
    type RuleRunInput
} from '../rule.ts';
import { duplicateMessage, hasMultipleOwners } from './duplicate-detection.ts';
import { collectFileOwnership, type OwnerInformation } from './file-ownership.ts';

function ruleName(): 'noDuplicatedFiles' {
    return 'noDuplicatedFiles';
}

function globalSchema(): typeof pathAllowListGlobalSchema {
    return pathAllowListGlobalSchema;
}

function perPackageSchema(): typeof pathAllowListPerPackageSchema {
    return pathAllowListPerPackageSchema;
}

type RuleName = ReturnType<typeof ruleName>;
type GlobalConfiguration = Readonly<z.infer<ReturnType<typeof globalSchema>>>;
type PerPackageConfiguration = Readonly<z.infer<ReturnType<typeof perPackageSchema>>>;
type RunInput = RuleRunInput<RuleName, GlobalConfiguration, PerPackageConfiguration>;

function everyOwnerConsents(
    filePath: string,
    owners: readonly OwnerInformation[],
    perPackageSettings: RunInput['perPackageSettings']
): boolean {
    return owners.every(function (owner) {
        const allowList = perPackageSettings.get(owner.bundleName)?.noDuplicatedFiles?.allowList;
        return allowList?.includes(filePath) ?? false;
    });
}

function findDuplicateIssues(
    bundles: readonly AnalyzedBundle[],
    perPackageSettings: RunInput['perPackageSettings'],
    globalConfiguration: GlobalConfiguration
): readonly string[] {
    const globallyAllowed = new Set(globalConfiguration.allowList);
    return Array.from(collectFileOwnership(bundles)).flatMap(function ([ filePath, owners ]) {
        if (!hasMultipleOwners(owners)) {
            return [];
        }
        const message = duplicateMessage(filePath, owners);
        if (message === undefined) {
            return [];
        }
        if (globallyAllowed.has(filePath) || everyOwnerConsents(filePath, owners, perPackageSettings)) {
            return [];
        }
        return [ message ];
    });
}

async function run(input: RunInput): Promise<readonly string[]> {
    const globalConfiguration = input.settings?.noDuplicatedFiles;
    if (globalConfiguration?.enabled !== true) {
        return [];
    }
    return findDuplicateIssues(input.bundles, input.perPackageSettings, globalConfiguration);
}

export const noDuplicatedFilesRule: CheckRuleDefinition<RuleName, GlobalConfiguration, PerPackageConfiguration> = {
    get name() {
        return ruleName();
    },
    get globalSchema() {
        return globalSchema();
    },
    get perPackageSchema() {
        return perPackageSchema();
    },
    run
};

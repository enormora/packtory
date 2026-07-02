import type { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    defineCheckRule,
    pathAllowListGlobalSchema,
    pathAllowListPerPackageSchema,
    type RuleRunParams
} from '../rule.ts';
import { duplicateMessage, hasMultipleOwners } from './duplicate-detection.ts';
import { collectFileOwnership, type OwnerInfo } from './file-ownership.ts';

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
type GlobalConfig = Readonly<z.infer<ReturnType<typeof globalSchema>>>;
type PerPackageConfig = Readonly<z.infer<ReturnType<typeof perPackageSchema>>>;
type RunParams = RuleRunParams<RuleName, GlobalConfig, PerPackageConfig>;

function everyOwnerConsents(
    filePath: string,
    owners: readonly OwnerInfo[],
    perPackageSettings: RunParams['perPackageSettings']
): boolean {
    return owners.every(function (owner) {
        const allowList = perPackageSettings.get(owner.bundleName)?.noDuplicatedFiles?.allowList;
        return allowList?.includes(filePath) ?? false;
    });
}

function findDuplicateIssues(
    bundles: readonly AnalyzedBundle[],
    perPackageSettings: RunParams['perPackageSettings'],
    globalConfig: GlobalConfig
): readonly string[] {
    const globallyAllowed = new Set(globalConfig.allowList);
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

async function run(params: RunParams): Promise<readonly string[]> {
    const globalConfig = params.settings?.noDuplicatedFiles;
    if (globalConfig?.enabled !== true) {
        return [];
    }
    return findDuplicateIssues(params.bundles, params.perPackageSettings, globalConfig);
}

export const noDuplicatedFilesRule = defineCheckRule(ruleName, globalSchema, perPackageSchema, run);

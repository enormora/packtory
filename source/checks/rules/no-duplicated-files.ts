import { z } from 'zod/mini';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { nonEmptyStringSchema } from '../../config/base-validations.ts';
import type { CheckRuleDefinition, RuleRunParams } from '../rule.ts';

const ruleName = 'noDuplicatedFiles';

const globalSchema = z.strictObject({
    enabled: z.boolean(),
    allowList: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
});

const perPackageSchema = z.strictObject({
    allowList: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
});

type GlobalConfig = z.infer<typeof globalSchema>;
type PerPackageConfig = z.infer<typeof perPackageSchema>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;

function collectFileOwnership(bundles: readonly LinkedBundle[]): Map<string, Set<string>> {
    const fileOwnership = new Map<string, Set<string>>();

    for (const bundle of bundles) {
        for (const resource of bundle.contents) {
            const filePath = resource.fileDescription.sourceFilePath;
            const owners = fileOwnership.get(filePath) ?? new Set<string>();
            owners.add(bundle.name);
            fileOwnership.set(filePath, owners);
        }
    }

    return fileOwnership;
}

function everyOwnerConsents(
    filePath: string,
    owners: ReadonlySet<string>,
    perPackageSettings: RunParams['perPackageSettings']
): boolean {
    return Array.from(owners).every((owner) => {
        const allowList = perPackageSettings.get(owner)?.noDuplicatedFiles?.allowList;
        return allowList?.includes(filePath) ?? false;
    });
}

function formatOwners(owners: ReadonlySet<string>): string {
    return Array.from(owners)
        .toSorted((left, right) => {
            return left.localeCompare(right);
        })
        .join(', ');
}

function findDuplicateIssues(
    bundles: readonly LinkedBundle[],
    perPackageSettings: RunParams['perPackageSettings'],
    globalConfig: GlobalConfig
): readonly string[] {
    const globallyAllowed = new Set(globalConfig.allowList);
    return Array.from(collectFileOwnership(bundles).entries()).flatMap(([filePath, owners]) => {
        const isDuplicate = owners.size > 1;
        const isAllowed = globallyAllowed.has(filePath) || everyOwnerConsents(filePath, owners, perPackageSettings);
        if (isDuplicate && !isAllowed) {
            return [`File "${filePath}" is included in multiple packages: ${formatOwners(owners)}`];
        }
        return [];
    });
}

function run(params: RunParams): readonly string[] {
    const globalConfig = params.settings?.noDuplicatedFiles;
    if (globalConfig?.enabled !== true) {
        return [];
    }
    return findDuplicateIssues(params.bundles, params.perPackageSettings, globalConfig);
}

export const noDuplicatedFilesRule: CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig> = {
    name: ruleName,
    globalSchema,
    perPackageSchema,
    run
};

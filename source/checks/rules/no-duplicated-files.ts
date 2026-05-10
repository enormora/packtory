import type { z } from 'zod/mini';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    pathAllowListGlobalSchema,
    pathAllowListPerPackageSchema,
    type CheckRuleDefinition,
    type RuleRunParams
} from '../rule.ts';

const ruleName = 'noDuplicatedFiles';

const globalSchema = pathAllowListGlobalSchema;
const perPackageSchema = pathAllowListPerPackageSchema;

type GlobalConfig = z.infer<typeof globalSchema>;
type PerPackageConfig = z.infer<typeof perPackageSchema>;
type RunParams = RuleRunParams<typeof ruleName, GlobalConfig, PerPackageConfig>;

type OwnerInfo = {
    readonly bundleName: string;
    readonly survivingBindings: ReadonlySet<string>;
};

function collectFileOwnership(bundles: readonly AnalyzedBundle[]): Map<string, OwnerInfo[]> {
    const ownership = new Map<string, OwnerInfo[]>();

    for (const bundle of bundles) {
        for (const resource of bundle.contents) {
            const filePath = resource.fileDescription.sourceFilePath;
            const owners = ownership.get(filePath) ?? [];
            owners.push({
                bundleName: bundle.name,
                survivingBindings: resource.analysis.survivingBindings
            });
            ownership.set(filePath, owners);
        }
    }

    return ownership;
}

function intersectTwo(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
    const result = new Set<string>();
    for (const name of left) {
        if (right.has(name)) {
            result.add(name);
        }
    }
    return result;
}

function intersectAll(sets: readonly [ReadonlySet<string>, ...(readonly ReadonlySet<string>[])]): ReadonlySet<string> {
    const [first, ...rest] = sets;
    return rest.reduce<Set<string>>(intersectTwo, new Set(first));
}

function ownerNames(owners: readonly OwnerInfo[]): readonly string[] {
    return owners
        .map((owner) => {
            return owner.bundleName;
        })
        .toSorted((left, right) => {
            return left.localeCompare(right);
        });
}

function everyOwnerConsents(
    filePath: string,
    owners: readonly OwnerInfo[],
    perPackageSettings: RunParams['perPackageSettings']
): boolean {
    return owners.every((owner) => {
        const allowList = perPackageSettings.get(owner.bundleName)?.noDuplicatedFiles?.allowList;
        return allowList?.includes(filePath) ?? false;
    });
}

function formatSharedDeclarationsMessage(
    filePath: string,
    sharedDeclarations: ReadonlySet<string>,
    owners: readonly OwnerInfo[]
): string {
    const ownersList = ownerNames(owners).join(', ');
    const sortedDeclarations = Array.from(sharedDeclarations).toSorted((left, right) => {
        return left.localeCompare(right);
    });
    const lines = [
        `File "${filePath}" has shared declarations across multiple packages:`,
        ...sortedDeclarations.map((declaration) => {
            return `  - "${declaration}" → ${ownersList}`;
        })
    ];
    return lines.join('\n');
}

function formatPathLevelMessage(filePath: string, owners: readonly OwnerInfo[]): string {
    return `File "${filePath}" is included in multiple packages: ${ownerNames(owners).join(', ')}`;
}

type MultipleOwners = readonly [OwnerInfo, OwnerInfo, ...(readonly OwnerInfo[])];

const minimumOwnerCountForDuplicate = 2;

function hasMultipleOwners(owners: readonly OwnerInfo[]): owners is MultipleOwners {
    return owners.length >= minimumOwnerCountForDuplicate;
}

function duplicateMessage(filePath: string, owners: MultipleOwners): string | undefined {
    const allOwnersHaveNoBindings = owners.every((owner) => {
        return owner.survivingBindings.size === 0;
    });
    if (allOwnersHaveNoBindings) {
        return formatPathLevelMessage(filePath, owners);
    }
    const [firstOwner, ...remainingOwners] = owners;
    const sharedDeclarations = intersectAll([
        firstOwner.survivingBindings,
        ...remainingOwners.map((owner) => {
            return owner.survivingBindings;
        })
    ]);
    if (sharedDeclarations.size === 0) {
        return undefined;
    }
    return formatSharedDeclarationsMessage(filePath, sharedDeclarations, owners);
}

function findDuplicateIssues(
    bundles: readonly AnalyzedBundle[],
    perPackageSettings: RunParams['perPackageSettings'],
    globalConfig: GlobalConfig
): readonly string[] {
    const globallyAllowed = new Set(globalConfig.allowList);
    return Array.from(collectFileOwnership(bundles).entries()).flatMap(([filePath, owners]) => {
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
        return [message];
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

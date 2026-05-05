import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import type { AllowListEntry, ChecksSettings } from '../../config/config.ts';
import type { CheckContext } from '../rule.ts';

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

function getAllowList(settings: ChecksSettings | undefined): readonly AllowListEntry[] | undefined {
    const option = settings?.noDuplicatedFiles;

    if (option?.enabled !== true) {
        return undefined;
    }

    return option.allowList;
}

function isAllowed(
    filePath: string,
    owners: ReadonlySet<string>,
    allowList: readonly AllowListEntry[] | undefined
): boolean {
    if (allowList === undefined) {
        return false;
    }

    return allowList.some((entry) => {
        if (typeof entry === 'string') {
            return entry === filePath;
        }

        if (entry.filePath !== filePath) {
            return false;
        }

        const allowedOwners = new Set(entry.packages);
        return Array.from(owners).every((owner) => {
            return allowedOwners.has(owner);
        });
    });
}

export function isNoDuplicatedFilesRuleEnabled(settings: ChecksSettings | undefined): boolean {
    const option = settings?.noDuplicatedFiles;

    if (option === undefined) {
        return false;
    }

    return option.enabled;
}

export function runNoDuplicatedFilesRule(
    context: CheckContext,
    settings: ChecksSettings | undefined
): readonly string[] {
    const fileOwnership = collectFileOwnership(context.bundles);
    const issues: string[] = [];
    const allowList = getAllowList(settings);

    for (const [filePath, owners] of fileOwnership.entries()) {
        if (owners.size > 1 && !isAllowed(filePath, owners, allowList)) {
            const ownerList = Array.from(owners)
                .toSorted((left, right) => {
                    return left.localeCompare(right);
                })
                .join(', ');
            issues.push(`File "${filePath}" is included in multiple packages: ${ownerList}`);
        }
    }

    return issues;
}

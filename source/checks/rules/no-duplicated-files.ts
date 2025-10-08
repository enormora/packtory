import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import type { ChecksSettings } from '../../config/config.ts';
import type { CheckRule } from '../rule.ts';

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

function getAllowList(settings: ChecksSettings | undefined): ReadonlySet<string> {
    const option = settings?.noDuplicatedFiles;

    if (option?.enabled !== true) {
        return new Set();
    }

    return new Set(option.allowList ?? []);
}

export const noDuplicatedFilesRule: CheckRule = {
    isEnabled(settings) {
        const option = settings?.noDuplicatedFiles;

        if (option === undefined) {
            return false;
        }

        return option.enabled;
    },
    run(context, settings) {
        const fileOwnership = collectFileOwnership(context.bundles);
        const issues: string[] = [];
        const allowList = getAllowList(settings);

        for (const [filePath, owners] of fileOwnership.entries()) {
            if (owners.size > 1 && !allowList.has(filePath)) {
                const ownerList = Array.from(owners).toSorted().join(', ');
                issues.push(`File "${filePath}" is included in multiple packages: ${ownerList}`);
            }
        }

        return issues;
    }
};

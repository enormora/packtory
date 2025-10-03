import type { LinkedBundle } from '../../linker/linked-bundle.ts';
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

export const noDuplicatedFilesRule: CheckRule = {
    isEnabled(settings) {
        return settings?.noDuplicatedFiles === true;
    },
    run(context) {
        const fileOwnership = collectFileOwnership(context.bundles);
        const issues: string[] = [];

        for (const [filePath, owners] of fileOwnership.entries()) {
            if (owners.size > 1) {
                const ownerList = Array.from(owners).toSorted().join(', ');
                issues.push(`File "${filePath}" is included in multiple packages: ${ownerList}`);
            }
        }

        return issues;
    }
};

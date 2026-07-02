import type { MainPackageJson } from '../../config/package-json.ts';

export type ImportsField = NonNullable<MainPackageJson['imports']>;

function escapeRegExp(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function compareKeyRelevance(specifier: string, left: string, right: string): number {
    if (left === specifier || right === specifier) {
        return left === specifier ? -1 : 1;
    }
    return right.length - left.length;
}

export function findMatchingImportEntryKey(specifier: string, importsField: ImportsField): string | undefined {
    const matchingKeys = Object
        .keys(importsField)
        .filter(function (key) {
            const wildcardPattern = `^${escapeRegExp(key).replaceAll('\\*', '.*')}$`;
            const wildcardRegex = new RegExp(wildcardPattern);
            return wildcardRegex.test(specifier);
        })
        .toSorted(function (left, right) {
            return compareKeyRelevance(specifier, left, right);
        });

    return matchingKeys[0];
}

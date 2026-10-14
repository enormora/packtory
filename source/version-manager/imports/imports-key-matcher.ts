import type { MainPackageManifest } from '../../configuration/package-manifest.ts';

export type ImportsField = NonNullable<MainPackageManifest['imports']>;

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
            const wildcardRegularExpression = new RegExp(wildcardPattern);
            return wildcardRegularExpression.test(specifier);
        })
        .toSorted(function (left, right) {
            return compareKeyRelevance(specifier, left, right);
        });

    return matchingKeys[0];
}

import type { MainPackageManifest } from '../../configuration/package-manifest.ts';

export type ImportsField = NonNullable<MainPackageManifest['imports']>;

function matchesImportKey(specifier: string, key: string): boolean {
    const wildcard = key.indexOf('*');
    if (wildcard === -1) {
        return specifier === key;
    }
    const prefix = key.slice(0, wildcard);
    const suffix = key.slice(wildcard + 1);
    return !suffix.includes('*')
        && specifier.length >= key.length - 1
        && specifier.startsWith(prefix)
        && specifier.endsWith(suffix);
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
            return matchesImportKey(specifier, key);
        })
        .toSorted(function (left, right) {
            return compareKeyRelevance(specifier, left, right);
        });

    return matchingKeys[0];
}

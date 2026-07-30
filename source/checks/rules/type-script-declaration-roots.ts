const relativeSpecifierPrefix = './';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function packagePathsIn(value: unknown): readonly string[] {
    if (typeof value === 'string') {
        return value.startsWith(relativeSpecifierPrefix)
            ? [ value.slice(relativeSpecifierPrefix.length) ]
            : [ value ];
    }

    if (typeof value === 'object' && value !== null) {
        return Object.values(value).flatMap(packagePathsIn);
    }

    return [];
}

function parseManifestContent(manifestContent: string): Readonly<Record<string, unknown>> {
    const manifest: unknown = JSON.parse(manifestContent);
    if (!isRecord(manifest)) {
        return {};
    }

    return manifest;
}

export function declarationRootsFromManifest(manifestContent: string): ReadonlySet<string> {
    const manifest = parseManifestContent(manifestContent);
    return new Set([
        ...packagePathsIn(manifest.exports),
        ...packagePathsIn(manifest.types),
        ...packagePathsIn(manifest.typings)
    ]);
}

export function isPackageManifestRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return Object.prototype.toString.call(value) === '[object Object]';
}

export function parsePackageManifest(manifestContent: string): Readonly<Record<string, unknown>> {
    const manifest: unknown = JSON.parse(manifestContent);
    if (!isPackageManifestRecord(manifest)) {
        return {};
    }

    return manifest;
}

function packagePathsIn(value: unknown): readonly string[] {
    if (typeof value === 'string') {
        return value.startsWith('./')
            ? [ value.slice('./'.length) ]
            : [ value ];
    }

    if (typeof value === 'object' && value !== null) {
        return Object.values(value).flatMap(packagePathsIn);
    }

    return [];
}

export function declarationRootsFromManifest(manifestContent: string): ReadonlySet<string> {
    const manifest = parsePackageManifest(manifestContent);
    return new Set([
        ...packagePathsIn(manifest.exports),
        ...packagePathsIn(manifest.types),
        ...packagePathsIn(manifest.typings)
    ]);
}

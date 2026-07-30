import type { PublishedPackageWithManifest } from '../../source/published-package/published-package.ts';

export function publishedPackage(
    packageName: string,
    manifestContent: string,
    files: Readonly<Record<string, string>>
): PublishedPackageWithManifest {
    return {
        name: packageName,
        version: '0.0.0',
        manifestFile: {
            filePath: 'package.json',
            content: manifestContent,
            isExecutable: false
        },
        contents: Object
            .entries(files)
            .map(function ([ filePath, content ]) {
                return {
                    directDependencies: new Set<string>(),
                    fileDescription: {
                        sourceFilePath: filePath,
                        targetFilePath: filePath,
                        content,
                        isExecutable: false
                    },
                    isExplicitlyIncluded: false,
                    isSubstituted: false
                };
            })
    } as unknown as PublishedPackageWithManifest;
}

export function manifest(packageName: string, fields: Readonly<Record<string, unknown>>): string {
    return JSON.stringify({
        name: packageName,
        version: '0.0.0',
        type: 'module',
        ...fields
    });
}

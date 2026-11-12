import { contentDigest, valueFingerprint } from '../common/value-fingerprint.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';

type PackageAnalysisIdentity = {
    readonly package: (publishedPackage: PublishedPackageWithManifest) => string;
    readonly resolution: (packages: ReadonlyMap<string, PublishedPackageWithManifest>) => string;
};

export function createPackageAnalysisIdentity(): PackageAnalysisIdentity {
    const identities = new WeakMap<PublishedPackageWithManifest, string>();
    function packageIdentity(publishedPackage: PublishedPackageWithManifest): string {
        const existing = identities.get(publishedPackage);
        if (existing !== undefined) {
            return existing;
        }
        const identity = valueFingerprint([
            publishedPackage.manifestFile.filePath,
            contentDigest(publishedPackage.manifestFile.content),
            publishedPackage.contents.map(function (resource) {
                return [ resource.fileDescription.targetFilePath, contentDigest(resource.fileDescription.content) ];
            })
        ]);
        identities.set(publishedPackage, identity);
        return identity;
    }
    return {
        package: packageIdentity,
        resolution(packages) {
            return valueFingerprint(Array.from(packages, function ([ name, publishedPackage ]) {
                return [ name, packageIdentity(publishedPackage) ];
            }));
        }
    };
}

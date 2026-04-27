import type { VersionedBundle, BundlePackageJson } from '../versioned-bundle.ts';

export function buildPackageManifest(bundle: VersionedBundle): BundlePackageJson {
    const packageJson: BundlePackageJson = {
        name: bundle.name,
        version: bundle.version,
        main: bundle.mainFile.targetFilePath,
        ...(Object.keys(bundle.dependencies).length > 0 ? { dependencies: bundle.dependencies } : {}),
        ...(Object.keys(bundle.peerDependencies).length > 0 ? { peerDependencies: bundle.peerDependencies } : {}),
        ...(bundle.packageType === undefined ? {} : { type: bundle.packageType }),
        ...(bundle.typesMainFile === undefined ? {} : { types: bundle.typesMainFile.targetFilePath })
    };

    return { ...bundle.additionalAttributes, ...packageJson };
}

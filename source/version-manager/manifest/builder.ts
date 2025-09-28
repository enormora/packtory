import type { SetRequired, PackageJson } from 'type-fest';
import type { VersionedBundle } from '../versioned-bundle.ts';

export type BundlePackageJson = Readonly<SetRequired<PackageJson, 'name' | 'version'>>;

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

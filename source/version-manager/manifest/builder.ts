import { isEmpty } from 'remeda';
import type { VersionedBundle, BundlePackageJson } from '../versioned-bundle.ts';

export function buildPackageManifest(bundle: VersionedBundle): BundlePackageJson {
    const packageJson: BundlePackageJson = {
        name: bundle.name,
        version: bundle.version,
        main: bundle.mainFile.targetFilePath,
        ...(isEmpty(bundle.dependencies) ? {} : { dependencies: bundle.dependencies }),
        ...(isEmpty(bundle.peerDependencies) ? {} : { peerDependencies: bundle.peerDependencies }),
        ...(bundle.packageType === undefined ? {} : { type: bundle.packageType }),
        ...(bundle.typesMainFile === undefined ? {} : { types: bundle.typesMainFile.targetFilePath })
    };

    return { ...bundle.additionalAttributes, ...packageJson };
}

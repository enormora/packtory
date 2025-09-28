import semver from 'semver';
import { buildPackageManifest } from './manifest/builder.ts';
import { serializePackageJson } from './manifest/serialize.ts';
import {
    buildVersionedBundle,
    type BuildVersionedBundleOptions,
    type VersionedBundle,
    type VersionedBundleWithManifest
} from './versioned-bundle.js';

export type VersionManager = {
    addVersion: (options: BuildVersionedBundleOptions) => VersionedBundleWithManifest;
    increaseVersion: (bundle: VersionedBundle) => VersionedBundleWithManifest;
};

export function createVersionManager(): VersionManager {
    return {
        addVersion(options) {
            const versionedBundle = buildVersionedBundle(options);
            const manifest = buildPackageManifest(versionedBundle);
            const packageJsonContent = serializePackageJson(manifest);

            return {
                ...versionedBundle,
                packageJson: manifest,
                manifestFile: {
                    content: packageJsonContent,
                    isExecutable: false,
                    filePath: 'package.json'
                }
            };
        },

        increaseVersion(versionedBundle) {
            const newVersion = semver.inc(versionedBundle.version, 'patch');
            if (newVersion === null) {
                throw new Error('Failed to increase version');
            }

            const newVersionedBundle: VersionedBundle = {
                ...versionedBundle,
                version: newVersion
            };
            const manifest = buildPackageManifest(newVersionedBundle);
            const packageJsonContent = serializePackageJson(manifest);

            return {
                ...newVersionedBundle,
                packageJson: manifest,
                manifestFile: {
                    content: packageJsonContent,
                    isExecutable: false,
                    filePath: 'package.json'
                }
            };
        }
    };
}

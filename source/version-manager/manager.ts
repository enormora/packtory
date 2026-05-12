import semver from 'semver';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import { inspectPackageJsonProvenance } from '../report/inspectors.ts';
import { buildPackageManifest } from './manifest/builder.ts';
import { serializePackageJson } from './manifest/serialize.ts';
import {
    buildVersionedBundle,
    type BuildVersionedBundleOptions,
    type VersionedBundle,
    type VersionedBundleWithManifest
} from './versioned-bundle.ts';

export type VersionManagerDependencies = {
    readonly progressBroadcaster: ProgressBroadcastProvider;
};

export type VersionManager = {
    addVersion: (options: BuildVersionedBundleOptions) => VersionedBundleWithManifest;
    increaseVersion: (bundle: VersionedBundle) => VersionedBundleWithManifest;
};

export function createVersionManager(dependencies: VersionManagerDependencies): VersionManager {
    const { progressBroadcaster } = dependencies;

    return {
        addVersion(options) {
            const versionedBundle = buildVersionedBundle(options);
            const manifest = buildPackageManifest(versionedBundle);
            const packageJsonContent = serializePackageJson(manifest);

            if (progressBroadcaster.hasSubscribers('packageJsonAssembled')) {
                progressBroadcaster.emit('packageJsonAssembled', {
                    packageName: versionedBundle.name,
                    fields: inspectPackageJsonProvenance(
                        manifest as Readonly<Record<string, unknown>>,
                        options.mainPackageJson as Readonly<Record<string, unknown>>,
                        options.additionalPackageJsonAttributes as Readonly<Record<string, unknown>> | undefined
                    )
                });
            }

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

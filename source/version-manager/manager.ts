import semver from 'semver';
import { packageManifestFilePath } from '../common/package-layout.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import { inspectPackageJsonProvenance } from '../report/inspectors/inspect-package-json-provenance.ts';
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

function toVersionedBundleWithManifest(versionedBundle: VersionedBundle): VersionedBundleWithManifest {
    const manifest = buildPackageManifest(versionedBundle);
    const packageJsonContent = serializePackageJson(manifest);

    return {
        ...versionedBundle,
        packageJson: manifest,
        manifestFile: {
            content: packageJsonContent,
            isExecutable: false,
            filePath: packageManifestFilePath
        }
    };
}

export function createVersionManager(dependencies: VersionManagerDependencies): VersionManager {
    const { progressBroadcaster } = dependencies;

    return {
        addVersion(options) {
            const versionedBundle = buildVersionedBundle(options);
            const materializedBundle = toVersionedBundleWithManifest(versionedBundle);

            if (progressBroadcaster.hasSubscribers('packageJsonAssembled')) {
                progressBroadcaster.emit('packageJsonAssembled', {
                    packageName: materializedBundle.name,
                    fields: inspectPackageJsonProvenance(
                        materializedBundle.packageJson as Readonly<Record<string, unknown>>,
                        options.mainPackageJson as Readonly<Record<string, unknown>>,
                        options.additionalPackageJsonAttributes as Readonly<Record<string, unknown>> | undefined
                    )
                });
            }

            return materializedBundle;
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

            return toVersionedBundleWithManifest(newVersionedBundle);
        }
    };
}

import semver from 'semver';
import { packageManifestFilePath } from '../common/package-layout.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import { inspectPackageManifestProvenance } from '../report/inspectors/inspect-package-manifest-provenance.ts';
import { buildPackageManifest } from './manifest/builder.ts';
import { serializePackageManifest } from './manifest/serialize.ts';
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
    const packageManifestContent = serializePackageManifest(manifest);

    return {
        ...versionedBundle,
        packageManifest: manifest,
        manifestFile: {
            content: packageManifestContent,
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

            if (progressBroadcaster.hasSubscribers('packageManifestAssembled')) {
                progressBroadcaster.emit('packageManifestAssembled', {
                    packageName: materializedBundle.name,
                    fields: inspectPackageManifestProvenance(
                        materializedBundle.packageManifest as Readonly<Record<string, unknown>>,
                        options.mainPackageManifest as Readonly<Record<string, unknown>>,
                        options.additionalPackageManifestAttributes as Readonly<Record<string, unknown>> | undefined
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

import semver from 'semver';
import type { Writable } from 'type-fest';
import type { BundleContent, BundleDescription, BundlePackageJson } from '../bundler/bundle-description.js';
import { serializePackageJson } from '../package-json.js';

export type Version = string;

export function increaseVersion(version: string, minimumVersion?: Version): string {
    if (minimumVersion !== undefined && semver.valid(minimumVersion) === null) {
        throw new Error(`Invalid minimumVersion ${minimumVersion} provided`);
    }

    const newVersion = semver.inc(version, 'patch');

    if (newVersion === null) {
        throw new Error(`Unable to increase version number ${version}`);
    }

    if (minimumVersion !== undefined && semver.lt(newVersion, minimumVersion)) {
        return minimumVersion;
    }

    return newVersion;
}

function isNotPackageJsonContentEntry(entry: BundleContent): boolean {
    return entry.targetFilePath !== 'package.json';
}

export function replaceBundleVersion(bundle: BundleDescription, newVersion: string): BundleDescription {
    const newPackageJson: Writable<BundlePackageJson> = { ...bundle.packageJson };
    newPackageJson.version = newVersion;

    const newContents: BundleContent[] = [
        {
            kind: 'source',
            targetFilePath: 'package.json',
            source: serializePackageJson(newPackageJson)
        },
        ...bundle.contents.filter(isNotPackageJsonContentEntry)
    ];

    return {
        contents: newContents,
        packageJson: newPackageJson as BundlePackageJson
    };
}

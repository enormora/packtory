import semver from 'semver';
import {PackageJson, SetRequired} from 'type-fest';
import {BundleContent, BundleDescription} from '../bundler/bundle-description.js';

export type Version = `${number}.${number}.${number}`;

export function increaseVersion(version: string, minimumVersion?: Version): string {
    if (minimumVersion && !semver.valid(minimumVersion)) {
        throw new Error(`Invalid minimumVersion ${minimumVersion} provided`);
    }

    const newVersion = semver.inc(version, 'patch');

    if (!newVersion) {
        throw new Error(`Unable to increase version number ${version}`);
    }

    if (minimumVersion && semver.lt(newVersion, minimumVersion)) {
        return minimumVersion;
    }

    return newVersion;
}

function isNotPackageJsonContentEntry(entry: BundleContent): boolean {
    return entry.targetFilePath !== 'package.json';
}

export function replaceBundleVersion(bundle: BundleDescription, newVersion: string): BundleDescription {
    const newPackageJson: SetRequired<PackageJson, 'name' | 'version'> = {...bundle.packageJson}
    newPackageJson.version = newVersion;

    const newContents = bundle.contents.filter(isNotPackageJsonContentEntry);
    newContents.push({kind: 'source', targetFilePath: 'package.json', source: JSON.stringify(newPackageJson, null, 4)});

    return {
        contents: [],
        packageJson: newPackageJson
    };
}

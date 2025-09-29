import type { PackageJson } from 'type-fest';
import { oneLine } from 'common-tags';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from '../config/package-json.ts';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import type { BundlePackageJson } from './manifest/builder.ts';

export type VersionedBundle = Pick<LinkedBundle, 'contents' | 'name'> & {
    readonly version: string;
    readonly dependencies: Record<string, string>;
    readonly peerDependencies: Record<string, string>;
    readonly additionalAttributes: AdditionalPackageJsonAttributes;
    readonly mainFile: TransferableFileDescription;
    readonly typesMainFile?: TransferableFileDescription | undefined;
    readonly packageType: PackageJson['type'];
};

export type VersionedBundleWithManifest = VersionedBundle & {
    readonly manifestFile: FileDescription;
    readonly packageJson: BundlePackageJson;
};

function getVersionFromDependencies(
    moduleName: string,
    mainPackageJson: MainPackageJson,
    kind: 'dependencies' | 'devDependencies' | 'peerDependencies'
): string {
    const dependencies = mainPackageJson[kind] ?? {};
    const version = dependencies[moduleName];

    if (version === undefined) {
        throw new Error(`Couldn’t determine ${kind} version number of ${moduleName}`);
    }

    return version;
}

export type BuildVersionedBundleOptions = {
    readonly bundle: LinkedBundle;
    readonly version: string;
    readonly mainPackageJson: MainPackageJson;
    readonly bundleDependencies: readonly VersionedBundle[];
    readonly bundlePeerDependencies: readonly VersionedBundle[];
    readonly additionalPackageJsonAttributes: AdditionalPackageJsonAttributes;
};

function findBundleByPackageName(bundles: readonly VersionedBundle[], name: string): VersionedBundle | undefined {
    return bundles.find((bundle) => {
        return bundle.name === name;
    });
}

type GroupedDependencies = {
    readonly dependencies: Record<string, string>;
    readonly peerDependencies: Record<string, string>;
};

function mergeDependencyGroups(...groups: Readonly<GroupedDependencies>[]): Readonly<GroupedDependencies> {
    return groups.reduce<GroupedDependencies>(
        (accumulator, group) => {
            return {
                dependencies: { ...accumulator.dependencies, ...group.dependencies },
                peerDependencies: { ...accumulator.peerDependencies, ...group.peerDependencies }
            };
        },
        { dependencies: {}, peerDependencies: {} }
    );
}

function groupBundleDependencies(
    bundle: LinkedBundle,
    bundlePeerDependencies: readonly VersionedBundle[],
    bundleDependencies: readonly VersionedBundle[]
): Readonly<GroupedDependencies> {
    const grouped: GroupedDependencies = { dependencies: {}, peerDependencies: {} };
    for (const dependencyName of bundle.linkedBundleDependencies.keys()) {
        const peerBundle = findBundleByPackageName(bundlePeerDependencies, dependencyName);
        if (peerBundle === undefined) {
            const foundBundle = findBundleByPackageName(bundleDependencies, dependencyName);
            if (foundBundle === undefined) {
                throw new Error(`Couldn’t determine version number of bundle dependency ${dependencyName}`);
            }
            grouped.dependencies[dependencyName] = foundBundle.version;
        } else {
            grouped.peerDependencies[dependencyName] = peerBundle.version;
        }
    }
    return grouped;
}

function groupExternalDependencies(
    bundle: LinkedBundle,
    mainPackageJson: MainPackageJson
): Readonly<GroupedDependencies> {
    const grouped: GroupedDependencies = { dependencies: {}, peerDependencies: {} };
    for (const dependencyName of bundle.externalDependencies.keys()) {
        if (mainPackageJson.peerDependencies?.[dependencyName] === undefined) {
            if (mainPackageJson.dependencies?.[dependencyName] === undefined) {
                throw new Error(
                    oneLine`Couldn’t determine version number of ${dependencyName},
                        because it is not listed in the main package.json`
                );
            }
            const version = getVersionFromDependencies(dependencyName, mainPackageJson, 'dependencies');
            grouped.dependencies[dependencyName] = version;
        } else {
            const version = getVersionFromDependencies(dependencyName, mainPackageJson, 'peerDependencies');
            grouped.peerDependencies[dependencyName] = version;
        }
    }
    return grouped;
}

function distributeDependencies(
    bundle: LinkedBundle,
    mainPackageJson: MainPackageJson,
    bundlePeerDependencies: readonly VersionedBundle[],
    bundleDependencies: readonly VersionedBundle[]
): Readonly<GroupedDependencies> {
    const bundleGrouped = groupBundleDependencies(bundle, bundlePeerDependencies, bundleDependencies);
    const externalGrouped = groupExternalDependencies(bundle, mainPackageJson);
    return mergeDependencyGroups(bundleGrouped, externalGrouped);
}

export function buildVersionedBundle(options: BuildVersionedBundleOptions): VersionedBundle {
    const {
        bundle,
        version,
        mainPackageJson,
        additionalPackageJsonAttributes,
        bundlePeerDependencies,
        bundleDependencies
    } = options;
    const [firstEntryPoint] = bundle.entryPoints;

    const distributedDependencies = distributeDependencies(
        bundle,
        mainPackageJson,
        bundlePeerDependencies,
        bundleDependencies
    );

    return {
        name: bundle.name,
        version,
        dependencies: distributedDependencies.dependencies,
        peerDependencies: distributedDependencies.peerDependencies,
        contents: bundle.contents,
        mainFile: firstEntryPoint.js,
        typesMainFile: firstEntryPoint.declarationFile,
        additionalAttributes: additionalPackageJsonAttributes,
        packageType: mainPackageJson.type
    };
}

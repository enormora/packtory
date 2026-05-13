import { oneLine } from 'common-tags';
import { mergeAll } from 'remeda';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import { classifySpecifier } from './specifier-classifier.ts';
import {
    renderMalformedSpecifierMessage,
    renderMutableSpecifierMessage,
    renderUnusedAllowListMessage,
    type MalformedOffender,
    type MutableOffender
} from './specifier-errors.ts';

type VersionedDependency = {
    readonly name: string;
    readonly version: string;
};
type DistributeDependenciesOptions = {
    readonly bundle: AnalyzedBundle;
    readonly mainPackageJson: MainPackageJson;
    readonly bundleDependencies: readonly VersionedDependency[];
    readonly bundlePeerDependencies: readonly VersionedDependency[];
    readonly allowMutableSpecifiers: readonly string[];
};

type GroupedDependencies = {
    readonly dependencies: Record<string, string>;
    readonly peerDependencies: Record<string, string>;
};

function getVersionFromDependencies(
    moduleName: string,
    mainPackageJson: MainPackageJson,
    kind: 'dependencies' | 'peerDependencies'
): string {
    const dependencies = { ...mainPackageJson[kind] };
    return String(dependencies[moduleName]);
}

function findBundleByPackageName(
    bundles: readonly VersionedDependency[],
    name: string
): VersionedDependency | undefined {
    return bundles.find((bundle) => {
        return bundle.name === name;
    });
}

function mergeDependencyGroups(...groups: Readonly<GroupedDependencies>[]): Readonly<GroupedDependencies> {
    return {
        dependencies: mergeAll(
            groups.map((group) => {
                return group.dependencies;
            })
        ),
        peerDependencies: mergeAll(
            groups.map((group) => {
                return group.peerDependencies;
            })
        )
    };
}

function groupBundleDependencies(
    bundle: AnalyzedBundle,
    bundlePeerDependencies: readonly VersionedDependency[],
    bundleDependencies: readonly VersionedDependency[]
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

type ExternalDependencyEntry = {
    readonly name: string;
    readonly version: string;
    readonly kind: 'dependencies' | 'peerDependencies';
};

function resolveExternalDependencyEntry(
    dependencyName: string,
    mainPackageJson: MainPackageJson
): ExternalDependencyEntry {
    const isPeer = mainPackageJson.peerDependencies?.[dependencyName] !== undefined;
    const isDirect = mainPackageJson.dependencies?.[dependencyName] !== undefined;

    if (!isPeer && !isDirect) {
        throw new Error(
            oneLine`Couldn’t determine version number of ${dependencyName},
                because it is not listed in the main package.json`
        );
    }

    const kind = isPeer ? 'peerDependencies' : 'dependencies';
    return {
        name: dependencyName,
        version: getVersionFromDependencies(dependencyName, mainPackageJson, kind),
        kind
    };
}

type SpecifierAccumulator = {
    readonly mutableOffenders: MutableOffender[];
    readonly malformedOffenders: MalformedOffender[];
    readonly usedAllowListEntries: Set<string>;
};

function recordClassification(
    entry: ExternalDependencyEntry,
    allowMutableSpecifiers: readonly string[],
    accumulator: SpecifierAccumulator
): void {
    const classification = classifySpecifier(entry.name, entry.version);
    if (classification.kind === 'malformed') {
        accumulator.malformedOffenders.push({
            name: entry.name,
            specifier: entry.version,
            reason: classification.reason
        });
        return;
    }
    if (classification.kind === 'mutable') {
        if (allowMutableSpecifiers.includes(entry.name)) {
            accumulator.usedAllowListEntries.add(entry.name);
        } else {
            accumulator.mutableOffenders.push({
                name: entry.name,
                specifier: entry.version,
                npaType: classification.npaType
            });
        }
    }
}

function throwHighestPriorityFailure(
    accumulator: SpecifierAccumulator,
    allowMutableSpecifiers: readonly string[]
): void {
    if (accumulator.malformedOffenders.length > 0) {
        throw new Error(renderMalformedSpecifierMessage(accumulator.malformedOffenders));
    }
    if (accumulator.mutableOffenders.length > 0) {
        throw new Error(renderMutableSpecifierMessage(accumulator.mutableOffenders));
    }
    const unusedAllowListEntries = allowMutableSpecifiers.filter((entry) => {
        return !accumulator.usedAllowListEntries.has(entry);
    });
    if (unusedAllowListEntries.length > 0) {
        throw new Error(renderUnusedAllowListMessage(unusedAllowListEntries));
    }
}

function groupExternalDependencies(
    bundle: AnalyzedBundle,
    mainPackageJson: MainPackageJson,
    allowMutableSpecifiers: readonly string[]
): Readonly<GroupedDependencies> {
    const grouped: GroupedDependencies = { dependencies: {}, peerDependencies: {} };
    const accumulator: SpecifierAccumulator = {
        mutableOffenders: [],
        malformedOffenders: [],
        usedAllowListEntries: new Set<string>()
    };

    for (const dependencyName of bundle.externalDependencies.keys()) {
        const entry = resolveExternalDependencyEntry(dependencyName, mainPackageJson);
        recordClassification(entry, allowMutableSpecifiers, accumulator);
        grouped[entry.kind][entry.name] = entry.version;
    }

    throwHighestPriorityFailure(accumulator, allowMutableSpecifiers);

    return grouped;
}

export function distributeDependencies(options: DistributeDependenciesOptions): Readonly<GroupedDependencies> {
    const bundleGrouped = groupBundleDependencies(
        options.bundle,
        options.bundlePeerDependencies,
        options.bundleDependencies
    );
    const externalGrouped = groupExternalDependencies(
        options.bundle,
        options.mainPackageJson,
        options.allowMutableSpecifiers
    );
    return mergeDependencyGroups(bundleGrouped, externalGrouped);
}

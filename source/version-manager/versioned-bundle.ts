import { ts as typescript } from 'ts-morph';
import type { JsonValue, PackageJson, SetRequired } from 'type-fest';
import { oneLine } from 'common-tags';
import { mergeAll } from 'remeda';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from '../config/package-json.ts';
import { isCodeFile } from '../common/code-files.ts';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import { classifySpecifier } from './specifier-classifier.ts';
import {
    renderMalformedSpecifierMessage,
    renderMutableSpecifierMessage,
    renderUnusedAllowListMessage,
    type MalformedOffender,
    type MutableOffender
} from './specifier-errors.ts';

export type BundlePackageJson = Readonly<SetRequired<PackageJson, 'name' | 'version'>>;
type ImportsField = NonNullable<MainPackageJson['imports']>;

export type VersionedBundle = Pick<AnalyzedBundle, 'contents' | 'name' | 'sideEffectsField'> & {
    readonly version: string;
    readonly dependencies: Record<string, string>;
    readonly peerDependencies: Record<string, string>;
    readonly importsField?: ImportsField | undefined;
    readonly additionalAttributes: AdditionalPackageJsonAttributes;
    readonly mainFile: TransferableFileDescription;
    readonly typesMainFile?: TransferableFileDescription | undefined;
    readonly packageType: 'module';
};

export type VersionedBundleWithManifest = VersionedBundle & {
    readonly manifestFile: FileDescription;
    readonly packageJson: BundlePackageJson;
};

export type BuildVersionedBundleOptions = {
    readonly bundle: AnalyzedBundle;
    readonly version: string;
    readonly mainPackageJson: MainPackageJson;
    readonly bundleDependencies: readonly VersionedBundle[];
    readonly bundlePeerDependencies: readonly VersionedBundle[];
    readonly additionalPackageJsonAttributes: AdditionalPackageJsonAttributes;
    readonly allowMutableSpecifiers: readonly string[];
};

function getVersionFromDependencies(
    moduleName: string,
    mainPackageJson: MainPackageJson,
    kind: 'dependencies' | 'peerDependencies'
): string {
    const dependencies = { ...mainPackageJson[kind] };
    return String(dependencies[moduleName]);
}

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

function distributeDependencies(options: BuildVersionedBundleOptions): Readonly<GroupedDependencies> {
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

function getHashImportSpecifiers(bundle: AnalyzedBundle): ReadonlySet<string> {
    const importSpecifiers = new Set<string>();

    for (const resource of bundle.contents) {
        const {
            fileDescription: { targetFilePath, content }
        } = resource;

        if (isCodeFile(targetFilePath)) {
            const parsedFile = typescript.preProcessFile(content, true);
            for (const literal of parsedFile.importedFiles) {
                const specifier = literal.fileName;
                if (specifier.startsWith('#')) {
                    importSpecifiers.add(specifier);
                }
            }
        }
    }

    return importSpecifiers;
}

function escapeRegExp(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function findMatchingImportEntryKey(specifier: string, importsField: ImportsField): string | undefined {
    const matchingKeys = Object.keys(importsField)
        .filter((key) => {
            const wildcardPattern = `^${escapeRegExp(key).replaceAll('\\*', '.*')}$`;
            return new RegExp(wildcardPattern).test(specifier);
        })
        .toSorted((left, right) => {
            if (left === specifier || right === specifier) {
                return left === specifier ? -1 : 1;
            }

            return right.length - left.length;
        });

    return matchingKeys[0];
}

function getConfiguredImportsOrThrow(
    mainPackageJson: MainPackageJson,
    referencedSpecifiers: ReadonlySet<string>
): ImportsField {
    if (mainPackageJson.imports !== undefined) {
        return mainPackageJson.imports;
    }

    const [firstSpecifier] = referencedSpecifiers;
    throw new Error(
        [
            `Found surviving package.json imports specifier "${firstSpecifier}"`,
            'but mainPackageJson.imports is not configured'
        ].join(' ')
    );
}

function collectReferencedImportsEntries(
    referencedSpecifiers: ReadonlySet<string>,
    configuredImports: ImportsField
): ImportsField {
    const importsField: Record<string, JsonValue> = {};

    for (const specifier of referencedSpecifiers) {
        const matchingKey = findMatchingImportEntryKey(specifier, configuredImports);
        if (matchingKey === undefined) {
            throw new Error(
                [
                    `Found surviving package.json imports specifier "${specifier}"`,
                    'but no matching mainPackageJson.imports entry'
                ].join(' ')
            );
        }

        const matchingImport = configuredImports[matchingKey];
        if (matchingImport === undefined) {
            throw new Error(
                [
                    `Found surviving package.json imports specifier "${specifier}"`,
                    `but matching mainPackageJson.imports entry "${matchingKey}" is undefined`
                ].join(' ')
            );
        }

        importsField[matchingKey] = matchingImport;
    }

    return importsField;
}

function buildImportsField(bundle: AnalyzedBundle, mainPackageJson: MainPackageJson): ImportsField | undefined {
    const referencedSpecifiers = getHashImportSpecifiers(bundle);
    if (referencedSpecifiers.size === 0) {
        return undefined;
    }

    const configuredImports = getConfiguredImportsOrThrow(mainPackageJson, referencedSpecifiers);
    return collectReferencedImportsEntries(referencedSpecifiers, configuredImports);
}

export function buildVersionedBundle(options: BuildVersionedBundleOptions): VersionedBundle {
    const { bundle, version, mainPackageJson, additionalPackageJsonAttributes } = options;
    const [firstEntryPoint] = bundle.entryPoints;

    const distributedDependencies = distributeDependencies(options);
    const importsField = buildImportsField(bundle, mainPackageJson);

    return {
        name: bundle.name,
        version,
        dependencies: distributedDependencies.dependencies,
        peerDependencies: distributedDependencies.peerDependencies,
        ...(importsField === undefined ? {} : { importsField }),
        contents: bundle.contents,
        mainFile: firstEntryPoint.js,
        typesMainFile: firstEntryPoint.declarationFile,
        additionalAttributes: additionalPackageJsonAttributes,
        packageType: mainPackageJson.type,
        sideEffectsField: bundle.sideEffectsField
    };
}

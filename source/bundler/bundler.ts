import path from 'node:path';
import type { PackageJson } from 'type-fest';
import type { DependencyScanner } from '../dependency-scanner/scanner.js';
import {
    type DependencyFiles,
    type LocalFile,
    mergeDependencyFiles,
    type DependencyGraph
} from '../dependency-scanner/dependency-graph.js';
import { serializePackageJson } from '../package-json.js';
import {
    type AdditionalFileDescription,
    type BundleBuildOptions,
    type EntryPoints,
    validateBundleBuildOptions
} from './bundle-build-options.js';
import type { BundleContent, BundleDescription, BundlePackageJson } from './bundle-description.js';
import { substituteDependencies } from './substitute-bundles.js';

export type BundlerDependencies = {
    readonly dependencyScanner: DependencyScanner;
};

export type Bundler = {
    build(options: BundleBuildOptions): Promise<BundleDescription>;
};

function prependSourcesFolderIfNecessary(sourcesFolder: string, filePath: string): string {
    if (!path.isAbsolute(filePath)) {
        return path.join(sourcesFolder, filePath);
    }

    return filePath;
}

function combineAllPackageFiles(
    sourcesFolder: string,
    localDependencies: readonly LocalFile[],
    packageJson: BundlePackageJson,
    additionalFiles: readonly (AdditionalFileDescription | string)[] = []
): readonly BundleContent[] {
    const referenceContents = localDependencies.map((localFile): BundleContent => {
        const targetFilePath = path.relative(sourcesFolder, localFile.filePath);

        if (localFile.substitutionContent.isJust) {
            return {
                kind: 'substituted',
                sourceFilePath: localFile.filePath,
                targetFilePath,
                source: localFile.substitutionContent.value
            };
        }

        return {
            kind: 'reference',
            sourceFilePath: localFile.filePath,
            targetFilePath
        };
    });
    const additionalContents = additionalFiles.map((additionalFile): BundleContent => {
        if (typeof additionalFile === 'string') {
            return {
                kind: 'reference',
                sourceFilePath: path.join(sourcesFolder, additionalFile),
                targetFilePath: additionalFile
            };
        }

        if (path.isAbsolute(additionalFile.targetFilePath)) {
            throw new Error('The targetFilePath must be relative');
        }

        return {
            kind: 'reference',
            sourceFilePath: prependSourcesFolderIfNecessary(sourcesFolder, additionalFile.sourceFilePath),
            targetFilePath: additionalFile.targetFilePath
        };
    });

    return [
        {
            kind: 'source',
            source: serializePackageJson(packageJson),
            targetFilePath: 'package.json'
        },
        ...referenceContents,
        ...additionalContents
    ];
}

function containsBundleWithPackageName(bundles: readonly BundleDescription[], name: string): boolean {
    return bundles.some((bundle) => {
        return bundle.packageJson.name === name;
    });
}

type Foo = {
    readonly dependencies: Record<string, string>;
    readonly peerDependencies?: Record<string, string>;
};

function distributeDependencies(
    packageDependencies: Record<string, string>,
    bundlePeerDependencies: readonly BundleDescription[]
): Readonly<Foo> {
    const dependencies: Record<string, string> = {};
    const peerDependencies: Record<string, string> = {};

    for (const [dependencyName, dependencyVersion] of Object.entries(packageDependencies)) {
        if (containsBundleWithPackageName(bundlePeerDependencies, dependencyName)) {
            peerDependencies[dependencyName] = dependencyVersion;
        } else {
            dependencies[dependencyName] = dependencyVersion;
        }
    }

    return { dependencies, ...(Object.keys(peerDependencies).length > 0 ? { peerDependencies } : {}) };
}

function buildPackageJson(
    options: BundleBuildOptions,
    packageDependencies: Record<string, string>
): Readonly<BundlePackageJson> {
    const {
        name,
        version,
        sourcesFolder,
        mainPackageJson,
        entryPoints: [firstEntryPoint],
        additionalPackageJsonAttributes = {},
        bundlePeerDependencies = []
    } = options;

    const distributedDependencies = distributeDependencies(packageDependencies, bundlePeerDependencies);
    const types =
        firstEntryPoint.declarationFile === undefined
            ? undefined
            : path.relative(sourcesFolder, firstEntryPoint.declarationFile);

    const packageJson: BundlePackageJson = {
        ...distributedDependencies,
        name,
        version,
        main: path.relative(sourcesFolder, firstEntryPoint.js),
        ...(mainPackageJson.type === undefined ? {} : { type: mainPackageJson.type }),
        ...(types === undefined ? {} : { types })
    };

    return { ...additionalPackageJsonAttributes, ...packageJson };
}

type ScanAndSubstituteOptions = {
    readonly entryPoint: string;
    readonly sourcesFolder: string;
    readonly mainPackageJson: Readonly<PackageJson>;
    readonly includeSourceMapFiles: boolean;
    readonly resolveDeclarationFiles: boolean;
    readonly bundleDependencies: readonly BundleDescription[];
};

type ResolveOptions = {
    readonly entryPoints: EntryPoints;
    readonly sourcesFolder: string;
    readonly mainPackageJson: Readonly<PackageJson>;
    readonly includeSourceMapFiles: boolean;
    readonly bundleDependencies: readonly BundleDescription[];
};

export function createBundler(dependencies: Readonly<BundlerDependencies>): Bundler {
    const { dependencyScanner } = dependencies;

    async function scanAndSubstitute(options: Readonly<ScanAndSubstituteOptions>): Promise<DependencyGraph> {
        const {
            entryPoint,
            sourcesFolder,
            mainPackageJson,
            includeSourceMapFiles,
            resolveDeclarationFiles,
            bundleDependencies
        } = options;
        const moduleResolution = mainPackageJson.type === 'module' ? 'module' : 'common-js';

        const dependencyGraph = await dependencyScanner.scan(entryPoint, sourcesFolder, {
            mainPackageJson,
            moduleResolution,
            includeSourceMapFiles,
            includeDevDependencies: resolveDeclarationFiles,
            resolveDeclarationFiles
        });

        return substituteDependencies(dependencyGraph, entryPoint, bundleDependencies, resolveDeclarationFiles);
    }

    async function resolveDependenciesForAllEntrypoints(options: Readonly<ResolveOptions>): Promise<DependencyFiles> {
        const { entryPoints, sourcesFolder, mainPackageJson, includeSourceMapFiles, bundleDependencies } = options;
        let dependencyFiles: DependencyFiles = { topLevelDependencies: {}, localFiles: [] };

        for (const entryPoint of entryPoints) {
            const jsDependencyGraph = await scanAndSubstitute({
                entryPoint: entryPoint.js,
                sourcesFolder,
                mainPackageJson,
                includeSourceMapFiles,
                resolveDeclarationFiles: false,
                bundleDependencies
            });
            dependencyFiles = mergeDependencyFiles(dependencyFiles, jsDependencyGraph.flatten(entryPoint.js));

            if (entryPoint.declarationFile !== undefined) {
                const declarationDependencyGraph = await scanAndSubstitute({
                    entryPoint: entryPoint.declarationFile,
                    sourcesFolder,
                    mainPackageJson,
                    includeSourceMapFiles,
                    resolveDeclarationFiles: true,
                    bundleDependencies
                });
                dependencyFiles = mergeDependencyFiles(
                    dependencyFiles,
                    declarationDependencyGraph.flatten(entryPoint.declarationFile)
                );
            }
        }

        return dependencyFiles;
    }

    return {
        async build(options) {
            validateBundleBuildOptions(options);

            const { includeSourceMapFiles = false, bundleDependencies = [], bundlePeerDependencies = [] } = options;

            const resolvedDependencies = await resolveDependenciesForAllEntrypoints({
                entryPoints: options.entryPoints,
                sourcesFolder: options.sourcesFolder,
                mainPackageJson: options.mainPackageJson,
                includeSourceMapFiles,
                bundleDependencies: [...bundleDependencies, ...bundlePeerDependencies]
            });

            const packageJson = buildPackageJson(options, resolvedDependencies.topLevelDependencies);
            const contents = combineAllPackageFiles(
                options.sourcesFolder,
                resolvedDependencies.localFiles,
                packageJson,
                options.additionalFiles
            );

            return { contents, packageJson };
        }
    };
}

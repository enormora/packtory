import path from 'node:path';
import type { DependencyScanner } from '../dependency-scanner/scanner.js';
import {
    type DependencyFiles,
    mergeDependencyFiles,
    type DependencyGraph
} from '../dependency-scanner/dependency-graph.js';
import type { MainPackageJson } from '../config/package-json.js';
import { type BundleBuildOptions, type EntryPoints, validateBundleBuildOptions } from './bundle-build-options.js';
import type { BundleDescription, BundlePackageJson } from './bundle-description.js';
import { substituteDependencies } from './substitute-bundles.js';
import { combineAllPackageFiles } from './content.js';

export type BundlerDependencies = {
    readonly dependencyScanner: DependencyScanner;
};

export type Bundler = {
    build(options: BundleBuildOptions): Promise<BundleDescription>;
};

function containsBundleWithPackageName(bundles: readonly BundleDescription[], name: string): boolean {
    return bundles.some((bundle) => {
        return bundle.packageJson.name === name;
    });
}

type GroupedDependencies = {
    readonly dependencies: Record<string, string>;
    readonly peerDependencies?: Record<string, string>;
};

function distributeDependencies(
    packageDependencies: Record<string, string>,
    bundlePeerDependencies: readonly BundleDescription[]
): Readonly<GroupedDependencies> {
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
    readonly mainPackageJson: MainPackageJson;
    readonly includeSourceMapFiles: boolean;
    readonly resolveDeclarationFiles: boolean;
    readonly bundleDependencies: readonly BundleDescription[];
};

type ResolveOptions = {
    readonly entryPoints: EntryPoints;
    readonly sourcesFolder: string;
    readonly mainPackageJson: MainPackageJson;
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

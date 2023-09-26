import path from 'path';
import { PackageJson, SetRequired } from 'type-fest';
import { DependencyScanner } from '../dependency-scanner/scanner.js';
import { ModuleResolution } from '../dependency-scanner/typescript-project-analyzer.js';
import {
    AdditionalFileDescription,
    BundleBuildOptions,
    EntryPoints,
    validateBundleBuildOptions,
} from './bundle-build-options.js';
import { DependencyFiles, LocalFile, mergeDependencyFiles } from '../dependency-scanner/dependency-graph.js';
import { BundleContent, BundleDescription } from './bundle-description.js';
import { substituteDependencies } from './substitute-bundles.js';

export interface BundlerDependencies {
    dependencyScanner: DependencyScanner;
}

export interface Bundler {
    build(options: BundleBuildOptions): Promise<BundleDescription>;
}

function prependSourcesFolderIfNecessary(sourcesFolder: string, filePath: string): string {
    if (!path.isAbsolute(filePath)) {
        return path.join(sourcesFolder, filePath);
    }

    return filePath;
}

function combineAllPackageFiles(
    sourcesFolder: string,
    localDependencies: readonly LocalFile[],
    packageJson: PackageJson,
    additionalFiles: readonly (string | AdditionalFileDescription)[] = [],
): readonly BundleContent[] {
    const referenceContents = localDependencies.map((localFile): BundleContent => {
        const targetFilePath = path.relative(sourcesFolder, localFile.filePath);

        if (localFile.substitutionContent.isJust) {
            return {
                kind: 'substituted',
                sourceFilePath: localFile.filePath,
                targetFilePath,
                source: localFile.substitutionContent.value,
            };
        }

        return {
            kind: 'reference',
            sourceFilePath: localFile.filePath,
            targetFilePath,
        };
    });
    const additionalContents = additionalFiles.map((additionalFile): BundleContent => {
        if (typeof additionalFile === 'string') {
            return {
                kind: 'reference',
                sourceFilePath: path.join(sourcesFolder, additionalFile),
                targetFilePath: additionalFile,
            };
        }

        if (path.isAbsolute(additionalFile.targetFilePath)) {
            throw new Error(`The targetFilePath must be relative`);
        }

        return {
            kind: 'reference',
            sourceFilePath: prependSourcesFolderIfNecessary(sourcesFolder, additionalFile.sourceFilePath),
            targetFilePath: additionalFile.targetFilePath,
        };
    });

    return [
        {
            kind: 'source',
            source: JSON.stringify(packageJson, null, 4),
            targetFilePath: 'package.json',
        },
        ...referenceContents,
        ...additionalContents,
    ];
}

function containsBundleWithPackageName(bundles: BundleDescription[], name: string): boolean {
    return bundles.some((bundle) => {
        return bundle.packageJson.name === name;
    });
}

function compareEntryKeys(entryA: [string, unknown], entryB: [string, unknown]): -1 | 0 | 1 {
    const [keyA] = entryA;
    const [keyB] = entryB;

    if (keyA < keyB) {
        return -1;
    }
    if (keyA > keyB) {
        return 1;
    }

    return 0;
}

function sortRecordByKey<T extends Record<string, unknown>>(record: T): T {
    const entries = Object.entries(record);

    entries.sort(compareEntryKeys);

    return Object.fromEntries(entries) as T;
}

function buildPackageJson(
    options: BundleBuildOptions,
    packageDependencies: Record<string, string>,
): SetRequired<PackageJson, 'name' | 'version'> {
    const {
        name,
        version,
        sourcesFolder,
        mainPackageJson,
        entryPoints,
        additionalPackageJsonAttributes = {},
        peerDependencies: bundlePeerDependencies = [],
    } = options;
    const [firstEntryPoint] = entryPoints;

    const mainEntryPoint = path.relative(sourcesFolder, firstEntryPoint.js);
    const dependencies: Record<string, string> = {};
    const peerDependencies: Record<string, string> = {};

    for (const [name, version] of Object.entries(packageDependencies)) {
        if (containsBundleWithPackageName(bundlePeerDependencies, name)) {
            peerDependencies[name] = version;
        } else {
            dependencies[name] = version;
        }
    }

    const packageJson: SetRequired<PackageJson, 'name' | 'version'> = {
        name,
        version,
        dependencies: sortRecordByKey(dependencies),
        main: mainEntryPoint,
        ...(mainPackageJson.type !== undefined ? { type: mainPackageJson.type } : {}),
    };

    if (Object.keys(peerDependencies).length > 0) {
        packageJson['peerDependencies'] = sortRecordByKey(peerDependencies);
    }

    if (typeof firstEntryPoint.declarationFile === 'string') {
        const mainDeclarationFile = path.relative(sourcesFolder, firstEntryPoint.declarationFile);
        packageJson.types = mainDeclarationFile;
    }

    return { ...sortRecordByKey(additionalPackageJsonAttributes), ...packageJson };
}

export function createBundler(dependencies: BundlerDependencies): Bundler {
    const { dependencyScanner } = dependencies;

    async function resolveDependenciesForAllEntrypoints(
        entryPoints: EntryPoints,
        sourcesFolder: string,
        mainPackageJson: PackageJson,
        includeSourceMapFiles: boolean,
        bundleDependencies: BundleDescription[],
    ): Promise<DependencyFiles> {
        let dependencies: DependencyFiles = { topLevelDependencies: {}, localFiles: [] };
        const moduleResolution: ModuleResolution = mainPackageJson.type === 'module' ? 'module' : 'common-js';

        for (const entryPoint of entryPoints) {
            const jsDependencyGraph = await dependencyScanner.scan(entryPoint.js, sourcesFolder, {
                mainPackageJson,
                moduleResolution,
                includeSourceMapFiles,
            });
            const substitutedJsDependencyGraph = substituteDependencies(
                jsDependencyGraph,
                entryPoint.js,
                bundleDependencies,
                false,
            );
            dependencies = mergeDependencyFiles(dependencies, substitutedJsDependencyGraph.flatten(entryPoint.js));

            if (entryPoint.declarationFile) {
                const declarationDependencyGraph = await dependencyScanner.scan(
                    entryPoint.declarationFile,
                    sourcesFolder,
                    {
                        mainPackageJson,
                        moduleResolution,
                        includeSourceMapFiles,
                        includeDevDependencies: true,
                        resolveDeclarationFiles: true,
                    },
                );
                const substitutedDeclarationDependencyGraph = substituteDependencies(
                    declarationDependencyGraph,
                    entryPoint.declarationFile,
                    bundleDependencies,
                    true,
                );
                dependencies = mergeDependencyFiles(
                    dependencies,
                    substitutedDeclarationDependencyGraph.flatten(entryPoint.declarationFile),
                );
            }
        }

        return dependencies;
    }

    return {
        async build(options) {
            validateBundleBuildOptions(options);

            const {
                entryPoints,
                sourcesFolder,
                mainPackageJson,
                includeSourceMapFiles = false,
                dependencies = [],
                peerDependencies = [],
            } = options;

            const resolvedDependencies = await resolveDependenciesForAllEntrypoints(
                entryPoints,
                sourcesFolder,
                mainPackageJson,
                includeSourceMapFiles,
                [...dependencies, ...peerDependencies],
            );

            const packageJson = buildPackageJson(options, resolvedDependencies.topLevelDependencies);
            const contents = combineAllPackageFiles(
                options.sourcesFolder,
                resolvedDependencies.localFiles,
                packageJson,
                options.additionalFiles,
            );

            return { contents, packageJson };
        },
    };
}

import path from 'path'
import {PackageJson, SetRequired} from "type-fest";
import {DependencyScanner} from "../dependency-scanner/scanner.js";
import {ModuleResolution} from '../dependency-scanner/typescript-project-analyzer.js';
import {BundleBuildOptions, EntryPoints, validateBundleBuildOptions} from "./bundle-build-options.js";
import {DependencyFiles, LocalFile, mergeDependencyFiles} from '../dependency-scanner/dependency-graph.js';
import {BundleContent, BundleDescription} from './bundle-description.js';
import {substituteDependencies} from './substitute-bundles.js';

export interface BundlerDependencies {
    dependencyScanner: DependencyScanner;
}

export interface Bundler {
    build(options: BundleBuildOptions): Promise<BundleDescription>
}

function combineAllPackageFiles(sourcesFolder: string, localDependencies: readonly LocalFile[], packageJson: PackageJson): readonly BundleContent[] {
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

    return [
        {
            kind: 'source',
            source: JSON.stringify(packageJson, null, 4),
            targetFilePath: 'package.json'
        },
        ...referenceContents
    ];
}

function containsBundleWithPackageName(bundles: BundleDescription[], name: string): boolean {
    return bundles.some((bundle) => {
        return bundle.packageJson.name === name;
    });
}

function buildPackageJson(
    options: BundleBuildOptions,
    packageDependencies: Record<string, string>
): SetRequired<PackageJson, 'name' | 'version'> {
    const {name, version, sourcesFolder, entryPoints, additionalPackageJsonAttributes = {}, peerDependencies: bundlePeerDependencies = []} = options;
    const [ firstEntryPoint ] = entryPoints;

    const mainEntryPoint = path.relative(sourcesFolder, firstEntryPoint.js);
    const dependencies: Record<string, string> = {};
    const peerDependencies: Record<string, string> = {};

    for (const [ name, version ] of Object.entries(packageDependencies)) {
        if (containsBundleWithPackageName(bundlePeerDependencies, name)) {
            peerDependencies[ name ] = version
        } else {
            dependencies[ name ] = version;
        }
    }

    const packageJson: SetRequired<PackageJson, 'name' | 'version'> = {
        name,
        version,
        dependencies,
        main: mainEntryPoint
    };

    if (Object.keys(peerDependencies).length > 0) {
        packageJson[ 'peerDependencies' ] = peerDependencies;
    }

    if (typeof firstEntryPoint.declarationFile === 'string') {
        const mainDeclarationFile = path.relative(sourcesFolder, firstEntryPoint.declarationFile);
        packageJson.types = mainDeclarationFile;
    }

    return {...additionalPackageJsonAttributes, ...packageJson}
}


export function createBundler(dependencies: BundlerDependencies): Bundler {
    const {dependencyScanner} = dependencies;

    async function resolveDependenciesForAllEntrypoints(entryPoints: EntryPoints, sourcesFolder: string, mainPackageJson: PackageJson, includeSourceMapFiles: boolean, bundleDependencies: BundleDescription[]): Promise<DependencyFiles> {
        let dependencies: DependencyFiles = {topLevelDependencies: {}, localFiles: []};
        const moduleResolution: ModuleResolution = mainPackageJson.type === 'module' ? 'module' : 'common-js';

        for (const entryPoint of entryPoints) {
            const jsDependencyGraph = await dependencyScanner.scan(entryPoint.js, sourcesFolder, {mainPackageJson, moduleResolution, includeSourceMapFiles});
            const substitutedJsDependencyGraph = substituteDependencies(jsDependencyGraph, entryPoint.js, bundleDependencies, false);
            dependencies = mergeDependencyFiles(dependencies, substitutedJsDependencyGraph.flatten(entryPoint.js));

            if (entryPoint.declarationFile) {
                const declarationDependencyGraph = await dependencyScanner.scan(entryPoint.declarationFile, sourcesFolder, {
                    mainPackageJson,
                    moduleResolution,
                    includeSourceMapFiles,
                    includeDevDependencies: true,
                    resolveDeclarationFiles: true
                });
                const substitutedDeclarationDependencyGraph = substituteDependencies(declarationDependencyGraph, entryPoint.declarationFile, bundleDependencies, true);
                dependencies = mergeDependencyFiles(dependencies, substitutedDeclarationDependencyGraph.flatten(entryPoint.declarationFile));
            }
        }

        return dependencies;
    }


    return {
        async build(options) {
            validateBundleBuildOptions(options);

            const {entryPoints, sourcesFolder, mainPackageJson, includeSourceMapFiles = false, dependencies = [], peerDependencies = []} = options;

            const resolvedDependencies = await resolveDependenciesForAllEntrypoints(entryPoints, sourcesFolder, mainPackageJson, includeSourceMapFiles, [ ...dependencies, ...peerDependencies ]);

            const packageJson = buildPackageJson(options, resolvedDependencies.topLevelDependencies);
            const contents = combineAllPackageFiles(options.sourcesFolder, resolvedDependencies.localFiles, packageJson);

            return {contents, packageJson};
        },
    }
}

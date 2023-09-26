import Maybe from 'true-myth/maybe';
import { PackageJson } from 'type-fest';
import { SourceMapFileLocator } from './source-map-file-locator.js';
import { ModuleResolution, TypescriptProjectAnalyzer, TypescriptProject } from './typescript-project-analyzer.js';
import { createDependencyGraph, DependencyGraph } from './dependency-graph.js';

interface ScanOptions {
    readonly includeDevDependencies: boolean;
    readonly includeSourceMapFiles: boolean;
    readonly mainPackageJson: PackageJson;
    readonly moduleResolution: ModuleResolution;
    readonly resolveDeclarationFiles: boolean;
    readonly failOnCompileErrors?: boolean;
}

function uniqueList<T>(list: readonly T[]): readonly T[] {
    return Array.from(new Set(list));
}

function isNodeModulesPath(filePath: string): boolean {
    return filePath.includes('/node_modules/');
}

function isLocalPath(filePath: string): boolean {
    return !isNodeModulesPath(filePath);
}

function extractModuleName(nodeModulePath: string): string {
    const pattern = /\/node_modules\/(?<moduleName>[^@]+?|(?:@.+?\/.+?))\//;

    const result = pattern.exec(nodeModulePath);

    if (!result) {
        throw new Error(`Couldn’t find node_modules package name for '${nodeModulePath}'`);
    }

    const { groups: { moduleName } = {} } = result;

    if (!moduleName) {
        throw new Error(`Couldn’t extract module name from path ${nodeModulePath}`);
    }

    return moduleName;
}

function isTopLevelModule(moduleName: string, options: ScanOptions): boolean {
    const { includeDevDependencies, mainPackageJson } = options;

    if (typeof mainPackageJson.dependencies?.[moduleName] !== 'undefined') {
        return true;
    }

    if (includeDevDependencies) {
        return typeof mainPackageJson.devDependencies?.[moduleName] !== 'undefined';
    }

    return false;
}

function getVersionFromDependencies(
    moduleName: string,
    dependencies: PackageJson['dependencies'] = {},
): string | undefined {
    const version = dependencies[moduleName];

    if (typeof version !== 'undefined') {
        return version;
    }

    return undefined;
}
function determineVersionNumber(moduleName: string, options: ScanOptions): string {
    const { mainPackageJson } = options;
    const version = getVersionFromDependencies(moduleName, mainPackageJson.dependencies);

    if (typeof version !== 'undefined') {
        return version;
    }

    const devDependencyVersion = getVersionFromDependencies(moduleName, mainPackageJson.devDependencies);
    if (typeof devDependencyVersion !== 'undefined') {
        return devDependencyVersion;
    }

    throw new Error(`Couldn’t determine version number of ${moduleName}`);
}
function addVersionNumbersToModules(moduleNames: readonly string[], options: ScanOptions): Map<string, string> {
    return new Map<string, string>(
        moduleNames.map((moduleName) => {
            return [moduleName, determineVersionNumber(moduleName, options)];
        }),
    );
}
function determineLocalDependencies(dependencies: readonly string[]): readonly string[] {
    return dependencies.filter(isLocalPath);
}

function determineTopLevelNodeModules(dependencies: readonly string[], options: ScanOptions): readonly string[] {
    const modulePaths = dependencies.filter(isNodeModulesPath);
    const moduleNames = modulePaths.map(extractModuleName);
    const uniqueModuleNames = uniqueList(moduleNames);

    return uniqueModuleNames.filter((moduleName) => isTopLevelModule(moduleName, options));
}

export interface DependencyScannerDependencies {
    readonly sourceMapFileLocator: SourceMapFileLocator;
    typescriptProjectAnalyzer: TypescriptProjectAnalyzer;
}

type FileType = 'javascript' | 'type-declartion';

export interface LocalFile {
    filePath: string;
    type: FileType;
    sourceMapFilePath: Maybe<string>;
}

export interface ScanResult {
    readonly localFiles: readonly LocalFile[];
    readonly topLevelDependencies: Record<string, string>;
}

export interface DependencyScanner {
    scan(entryPointFile: string, folder: string, options?: Partial<ScanOptions>): Promise<DependencyGraph>;
}

export function combineScanResults(scanResult1: ScanResult, scanResult2: ScanResult): ScanResult {
    return {
        localFiles: uniqueList([...scanResult1.localFiles, ...scanResult2.localFiles]),
        topLevelDependencies: { ...scanResult1.topLevelDependencies, ...scanResult2.topLevelDependencies },
    };
}

export function createDependencyScanner(
    dependencyScannerDependencies: DependencyScannerDependencies,
): DependencyScanner {
    const { sourceMapFileLocator, typescriptProjectAnalyzer } = dependencyScannerDependencies;

    async function scanDependenciesOfSourceFile(
        project: TypescriptProject,
        sourceFilePath: string,
        graph: DependencyGraph,
        options: Required<ScanOptions>,
    ): Promise<void> {
        const sourceMapFilePath = options.includeSourceMapFiles
            ? await sourceMapFileLocator.locate(sourceFilePath)
            : Maybe.nothing<string>();

        const referencedFilePaths = project.getReferencedSourceFilePaths(sourceFilePath);
        const topLevelDependencies = determineTopLevelNodeModules(referencedFilePaths, options);
        const topLevelDependenciesWithVersion = addVersionNumbersToModules(topLevelDependencies, options);
        const localFiles = determineLocalDependencies(referencedFilePaths);
        const tsSourceFile = project.getSourceFile(sourceFilePath);

        graph.addDependency(sourceFilePath, {
            sourceMapFilePath,
            topLevelDependencies: topLevelDependenciesWithVersion,
            tsSourceFile,
            substitutionContent: Maybe.nothing(),
        });

        for (const localeFile of localFiles) {
            if (!graph.isKnown(localeFile)) {
                await scanDependenciesOfSourceFile(project, localeFile, graph, options);
            }
            if (!graph.hasConnection(sourceFilePath, localeFile)) {
                graph.connect(sourceFilePath, localeFile);
            }
        }
    }

    return {
        async scan(entryPointFile, folder, options = {}) {
            const {
                includeDevDependencies = false,
                resolveDeclarationFiles = false,
                includeSourceMapFiles = false,
                mainPackageJson = {},
                moduleResolution = 'module',
                failOnCompileErrors = false,
            } = options;
            const scanOptions = {
                includeDevDependencies,
                includeSourceMapFiles,
                resolveDeclarationFiles,
                mainPackageJson,
                moduleResolution,
                failOnCompileErrors: failOnCompileErrors,
            };

            const graph = createDependencyGraph();
            const project = typescriptProjectAnalyzer.analyzeProject(folder, {
                resolveDeclarationFiles: scanOptions.resolveDeclarationFiles,
                failOnCompileErrors: scanOptions.failOnCompileErrors,
                moduleResolution: scanOptions.moduleResolution,
            });

            await scanDependenciesOfSourceFile(project, entryPointFile, graph, scanOptions);

            return graph;
        },
    };
}

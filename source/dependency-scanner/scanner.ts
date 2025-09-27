import Maybe from 'true-myth/maybe';
import { uniqueList } from '../list/unique-list.js';
import type { SourceMapFileLocator } from './source-map-file-locator.js';
import type { ModuleResolution, TypescriptProjectAnalyzer, TypescriptProject } from './typescript-project-analyzer.js';
import { createDependencyGraph, type DependencyGraphNodeData, type DependencyGraph } from './dependency-graph.js';

type ScanOptions = {
    readonly includeSourceMapFiles: boolean;
    readonly moduleResolution: ModuleResolution;
    readonly resolveDeclarationFiles: boolean;
    readonly failOnCompileErrors?: boolean;
};

function isNodeModulesPath(filePath: string): boolean {
    return filePath.includes('/node_modules/');
}

function isLocalPath(filePath: string): boolean {
    return !isNodeModulesPath(filePath);
}

function extractModuleName(nodeModulePath: string): string {
    const pattern = /\/node_modules\/(?<moduleName>[^@]+?|(?:@.+?\/.+?))\//;

    const result = pattern.exec(nodeModulePath);

    if (result === null) {
        throw new Error(`Couldn’t find node_modules package name for '${nodeModulePath}'`);
    }

    const { groups: { moduleName } = {} } = result;

    if (moduleName === undefined) {
        throw new Error(`Couldn’t extract module name from path ${nodeModulePath}`);
    }

    return moduleName;
}

function determineLocalDependencies(dependencies: readonly string[]): readonly string[] {
    return dependencies.filter(isLocalPath);
}

function determineExternalDependencies(dependencies: readonly string[]): readonly string[] {
    const modulePaths = dependencies.filter(isNodeModulesPath);
    const moduleNames = modulePaths.map(extractModuleName);
    const uniqueModuleNames = uniqueList(moduleNames);

    return uniqueModuleNames;
}

export type DependencyScannerDependencies = {
    readonly sourceMapFileLocator: SourceMapFileLocator;
    readonly typescriptProjectAnalyzer: TypescriptProjectAnalyzer;
};

export type DependencyScanner = {
    scan(entryPointFile: string, folder: string, options?: Partial<ScanOptions>): Promise<DependencyGraph>;
};

export function createDependencyScanner(
    dependencyScannerDependencies: Readonly<DependencyScannerDependencies>
): DependencyScanner {
    const { sourceMapFileLocator, typescriptProjectAnalyzer } = dependencyScannerDependencies;

    async function getDependencyNodeData(
        project: TypescriptProject,
        sourceFilePath: string,
        referencedFilePaths: readonly string[],
        options: Required<ScanOptions>
    ): Promise<DependencyGraphNodeData> {
        const sourceMapFilePath = options.includeSourceMapFiles
            ? await sourceMapFileLocator.locate(sourceFilePath)
            : Maybe.nothing<string>();

        const externalDependencies = determineExternalDependencies(referencedFilePaths);

        return {
            sourceMapFilePath,
            externalDependencies,
            project
        };
    }

    async function scanDependenciesOfSourceFile(
        project: TypescriptProject,
        sourceFilePath: string,
        graph: DependencyGraph,
        options: Required<ScanOptions>
    ): Promise<void> {
        const referencedFilePaths = project.getReferencedSourceFilePaths(sourceFilePath);
        const localFiles = determineLocalDependencies(referencedFilePaths);

        const nodeData = await getDependencyNodeData(project, sourceFilePath, referencedFilePaths, options);
        graph.addDependency(sourceFilePath, nodeData);

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
                resolveDeclarationFiles = false,
                includeSourceMapFiles = false,
                moduleResolution = 'module',
                failOnCompileErrors = false
            } = options;
            const scanOptions = {
                includeSourceMapFiles,
                resolveDeclarationFiles,
                moduleResolution,
                failOnCompileErrors
            };

            const graph = createDependencyGraph();
            const project = typescriptProjectAnalyzer.analyzeProject(folder, {
                resolveDeclarationFiles: scanOptions.resolveDeclarationFiles,
                failOnCompileErrors: scanOptions.failOnCompileErrors,
                moduleResolution: scanOptions.moduleResolution
            });

            await scanDependenciesOfSourceFile(project, entryPointFile, graph, scanOptions);

            return graph;
        }
    };
}

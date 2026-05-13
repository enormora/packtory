import { Maybe } from 'true-myth/maybe';
import { unique } from 'remeda';
import type { MainPackageJson } from '../config/package-json.ts';
import type { SourceMapFileLocator } from './source-map-file-locator.ts';
import type { TypescriptProjectAnalyzer, TypescriptProject } from './typescript-project-analyzer.ts';
import { createDependencyGraph, type DependencyGraphNodeData, type DependencyGraph } from './dependency-graph.ts';

type ScanOptions = {
    readonly includeSourceMapFiles: boolean;
    readonly resolveDeclarationFiles: boolean;
    readonly mainPackageJson: MainPackageJson;
};

type ScanOptionsInput = {
    readonly mainPackageJson: MainPackageJson;
    readonly includeSourceMapFiles?: boolean;
    readonly resolveDeclarationFiles?: boolean;
};

function isNodeModulesPath(filePath: string): boolean {
    return filePath.includes('/node_modules/');
}

function isLocalPath(filePath: string): boolean {
    return !isNodeModulesPath(filePath);
}

function extractModuleName(nodeModulePath: string): string {
    const prefix = '/node_modules/';
    const pattern = /\/node_modules\/(?:[^@]+?|(?:@.+?\/.+?))\//;

    const result = pattern.exec(nodeModulePath);

    if (result === null) {
        throw new Error(`Couldn’t find node_modules package name for '${nodeModulePath}'`);
    }

    return result[0].slice(prefix.length, -1);
}

function determineLocalDependencies(dependencies: readonly string[]): readonly string[] {
    return dependencies.filter(isLocalPath);
}

function determineExternalDependencies(dependencies: readonly string[]): readonly string[] {
    const modulePaths = dependencies.filter(isNodeModulesPath);
    const moduleNames = modulePaths.map(extractModuleName);
    const uniqueModuleNames = unique(moduleNames);

    return uniqueModuleNames;
}

export type DependencyScannerDependencies = {
    readonly sourceMapFileLocator: SourceMapFileLocator;
    readonly typescriptProjectAnalyzer: TypescriptProjectAnalyzer;
};

export type DependencyScanner = {
    scan: (entryPointFile: string, folder: string, options: ScanOptionsInput) => Promise<DependencyGraph>;
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
        async scan(entryPointFile, folder, options) {
            const { resolveDeclarationFiles = false, includeSourceMapFiles = false, mainPackageJson } = options;
            const scanOptions = {
                includeSourceMapFiles,
                resolveDeclarationFiles,
                mainPackageJson
            };

            const graph = createDependencyGraph();
            const project = typescriptProjectAnalyzer.analyzeProject(folder, {
                resolveDeclarationFiles: scanOptions.resolveDeclarationFiles,
                mainPackageJson: scanOptions.mainPackageJson
            });

            await scanDependenciesOfSourceFile(project, entryPointFile, graph, scanOptions);

            return graph;
        }
    };
}

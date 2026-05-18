import { Maybe } from 'true-myth/maybe';
import type { MainPackageJson } from '../config/package-json.ts';
import { createDependencyGraph, type DependencyGraph, type DependencyGraphNodeData } from './dependency-graph.ts';
import { determineExternalDependencies, determineLocalDependencies } from './module-path-classifier.ts';
import type { SourceMapFileLocator } from './source-map-file-locator.ts';
import type { TypescriptProject, TypescriptProjectAnalyzer } from './typescript-project-analyzer.ts';

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

import { Maybe } from 'true-myth/maybe';
import type { MainPackageJson } from '../config/package-json.ts';
import { isCodeFile } from '../common/code-files.ts';
import { createDependencyGraph, type DependencyGraph, type DependencyGraphNodeData } from './dependency-graph.ts';
import type { SourceMapFileLocator } from './source-map-file-locator.ts';
import type { ModuleReference } from './source-file-references.ts';
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

    type ScannableLocalReference = Extract<
        ModuleReference,
        { readonly kind: 'generated-manifest' | 'local-asset' | 'local-code' }
    >;

    async function getDependencyNodeData(
        project: TypescriptProject | undefined,
        sourceFilePath: string,
        externalDependencies: readonly string[],
        options: Required<ScanOptions>
    ): Promise<DependencyGraphNodeData> {
        const sourceMapFilePath =
            options.includeSourceMapFiles && isCodeFile(sourceFilePath)
                ? await sourceMapFileLocator.locate(sourceFilePath)
                : Maybe.nothing<string>();

        return {
            sourceMapFilePath,
            externalDependencies,
            project
        };
    }

    function localReferencesOf(references: readonly ModuleReference[]): readonly ScannableLocalReference[] {
        return references.filter((reference) => {
            return reference.kind !== 'external-package';
        });
    }

    function externalDependenciesOf(references: readonly ModuleReference[]): readonly string[] {
        return references.flatMap((reference) => {
            return reference.kind === 'external-package' ? [reference.packageName] : [];
        });
    }

    function referencedModulesOf(
        project: TypescriptProject,
        reference: ScannableLocalReference
    ): readonly ModuleReference[] {
        return reference.kind === 'local-code' ? project.getReferencedModules(reference.filePath) : [];
    }

    function projectFor(reference: ScannableLocalReference, project: TypescriptProject): TypescriptProject | undefined {
        return reference.kind === 'local-code' ? project : undefined;
    }

    async function scanDependenciesOfReference(
        project: TypescriptProject,
        reference: ScannableLocalReference,
        graph: DependencyGraph,
        options: Required<ScanOptions>
    ): Promise<void> {
        const sourceFilePath = reference.filePath;
        const referencedModules = referencedModulesOf(project, reference);
        const localReferences = localReferencesOf(referencedModules);
        const nodeData = await getDependencyNodeData(
            projectFor(reference, project),
            sourceFilePath,
            externalDependenciesOf(referencedModules),
            options
        );
        graph.addDependency(sourceFilePath, {
            ...nodeData,
            ...(reference.kind === 'generated-manifest' ? { isGeneratedManifest: true } : {})
        });
        for (const localReference of localReferences) {
            if (!graph.isKnown(localReference.filePath)) {
                await scanDependenciesOfReference(project, localReference, graph, options);
            }
            if (!graph.hasConnection(sourceFilePath, localReference.filePath)) {
                graph.connect(sourceFilePath, localReference.filePath);
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

            await scanDependenciesOfReference(
                project,
                { kind: 'local-code', filePath: entryPointFile },
                graph,
                scanOptions
            );

            return graph;
        }
    };
}

import { Maybe } from 'true-myth/maybe';
import type { MainPackageJson } from '../config/package-json.ts';
import { isCodeFile } from '../common/code-files.ts';
import { createDependencyGraph, type DependencyGraph, type DependencyGraphNodeData } from './dependency-graph.ts';
import type { SourceMapFileLocator } from './source-map-file-locator.ts';
import { moduleReferenceKind, type ModuleReference } from './source-file-references.ts';
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

type ScannableLocalReference = Extract<
    ModuleReference,
    | { readonly kind: typeof moduleReferenceKind.generatedManifest }
    | { readonly kind: typeof moduleReferenceKind.localAsset }
    | { readonly kind: typeof moduleReferenceKind.localCode }
>;

type ReferenceLists = {
    readonly localReferences: readonly ScannableLocalReference[];
    readonly externalDependencies: readonly string[];
};

export function createDependencyScanner(
    dependencyScannerDependencies: Readonly<DependencyScannerDependencies>
): DependencyScanner {
    const { sourceMapFileLocator, typescriptProjectAnalyzer } = dependencyScannerDependencies;

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

    function collectReferenceLists(references: readonly ModuleReference[]): ReferenceLists {
        const localReferences: ScannableLocalReference[] = [];
        const externalDependencies: string[] = [];

        for (const reference of references) {
            if (reference.kind === moduleReferenceKind.externalPackage) {
                externalDependencies.push(reference.packageName);
            } else {
                localReferences.push(reference);
            }
        }

        return {
            localReferences,
            externalDependencies
        };
    }

    async function connectLocalReferences(args: {
        readonly graph: DependencyGraph;
        readonly localReferences: readonly ScannableLocalReference[];
        readonly options: Required<ScanOptions>;
        readonly project: TypescriptProject;
        readonly scanReference: (
            project: TypescriptProject,
            reference: ScannableLocalReference,
            graph: DependencyGraph,
            options: Required<ScanOptions>
        ) => Promise<void>;
        readonly sourceFilePath: string;
    }): Promise<void> {
        for (const localReference of args.localReferences) {
            if (!args.graph.isKnown(localReference.filePath)) {
                await args.scanReference(args.project, localReference, args.graph, args.options);
            }
            if (!args.graph.hasConnection(args.sourceFilePath, localReference.filePath)) {
                args.graph.connect(args.sourceFilePath, localReference.filePath);
            }
        }
    }

    async function scanDependenciesOfReference(
        project: TypescriptProject,
        reference: ScannableLocalReference,
        graph: DependencyGraph,
        options: Required<ScanOptions>
    ): Promise<void> {
        const sourceFilePath = reference.filePath;
        const referencedModules =
            reference.kind === moduleReferenceKind.localCode ? project.getReferencedModules(sourceFilePath) : [];
        const { localReferences, externalDependencies } = collectReferenceLists(referencedModules);
        const nodeData = await getDependencyNodeData(
            reference.kind === moduleReferenceKind.localCode ? project : undefined,
            sourceFilePath,
            externalDependencies,
            options
        );
        graph.addDependency(
            sourceFilePath,
            reference.kind === moduleReferenceKind.generatedManifest
                ? { ...nodeData, isGeneratedManifest: true }
                : nodeData
        );
        await connectLocalReferences({
            graph,
            localReferences,
            options,
            project,
            scanReference: scanDependenciesOfReference,
            sourceFilePath
        });
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
                { kind: moduleReferenceKind.localCode, filePath: entryPointFile },
                graph,
                scanOptions
            );

            return graph;
        }
    };
}

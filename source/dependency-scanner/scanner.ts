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

type ScannableLocalReferenceKinds = {
    readonly generatedManifest: typeof moduleReferenceKind.generatedManifest;
    readonly localAsset: typeof moduleReferenceKind.localAsset;
    readonly localCode: typeof moduleReferenceKind.localCode;
};

type ScannableLocalReferenceKind = ScannableLocalReferenceKinds[keyof ScannableLocalReferenceKinds];

type ScannableLocalReference = Extract<ModuleReference, { readonly kind: ScannableLocalReferenceKind; }>;

type ReferenceLists = {
    readonly localReferences: readonly ScannableLocalReference[];
    readonly externalDependencies: readonly string[];
};

type ScanContext = {
    readonly folder: string;
    readonly graph: DependencyGraph;
    readonly options: Required<ScanOptions>;
    readonly project: TypescriptProject;
};

type DependencyNodeDataInput = {
    readonly externalDependencies: readonly string[];
    readonly options: Required<ScanOptions>;
    readonly project: TypescriptProject | undefined;
    readonly sourceFilePath: string;
    readonly sourcesFolder: string;
};

export function createDependencyScanner(
    dependencyScannerDependencies: Readonly<DependencyScannerDependencies>
): DependencyScanner {
    const { sourceMapFileLocator, typescriptProjectAnalyzer } = dependencyScannerDependencies;

    async function getDependencyNodeData(args: DependencyNodeDataInput): Promise<DependencyGraphNodeData> {
        const sourceMapFilePath = args.options.includeSourceMapFiles && isCodeFile(args.sourceFilePath)
            ? await sourceMapFileLocator.locate(args.sourceFilePath, args.sourcesFolder)
            : Maybe.nothing<string>();

        return {
            sourceMapFilePath,
            externalDependencies: args.externalDependencies,
            project: args.project
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

    function getReferencedModules(
        project: TypescriptProject,
        reference: ScannableLocalReference
    ): readonly ModuleReference[] {
        return reference.kind === moduleReferenceKind.localCode ? project.getReferencedModules(reference.filePath) : [];
    }

    function getNodeProject(
        project: TypescriptProject,
        reference: ScannableLocalReference
    ): TypescriptProject | undefined {
        return reference.kind === moduleReferenceKind.localCode ? project : undefined;
    }

    function toDependencyNode(
        reference: ScannableLocalReference,
        nodeData: DependencyGraphNodeData
    ): DependencyGraphNodeData {
        return reference.kind === moduleReferenceKind.generatedManifest
            ? { ...nodeData, isGeneratedManifest: true }
            : nodeData;
    }

    async function scanDependenciesOfReference(
        context: ScanContext,
        reference: ScannableLocalReference
    ): Promise<void> {
        const sourceFilePath = reference.filePath;
        const referencedModules = getReferencedModules(context.project, reference);
        const { localReferences, externalDependencies } = collectReferenceLists(referencedModules);
        const nodeData = await getDependencyNodeData({
            externalDependencies,
            options: context.options,
            project: getNodeProject(context.project, reference),
            sourceFilePath,
            sourcesFolder: context.folder
        });
        context.graph.addDependency(sourceFilePath, toDependencyNode(reference, nodeData));
        for (const localReference of localReferences) {
            if (!context.graph.isKnown(localReference.filePath)) {
                await scanDependenciesOfReference(context, localReference);
            }
            if (!context.graph.hasConnection(sourceFilePath, localReference.filePath)) {
                context.graph.connect(sourceFilePath, localReference.filePath);
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
                {
                    folder,
                    graph,
                    options: scanOptions,
                    project
                },
                { kind: moduleReferenceKind.localCode, filePath: entryPointFile }
            );

            return graph;
        }
    };
}

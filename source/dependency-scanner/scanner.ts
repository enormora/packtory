import { Maybe } from 'true-myth/maybe';
import type { MainPackageJson } from '../config/package-json.ts';
import { isCodeFile } from '../common/code-files.ts';
import { createDependencyGraph, type DependencyGraph, type DependencyGraphNodeData } from './dependency-graph.ts';
import type { DependencySpecifierReference } from './external-dependencies.ts';
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
    scanEntries: (
        entryPointFiles: readonly string[],
        folder: string,
        options: ScanOptionsInput
    ) => Promise<DependencyGraph>;
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
    readonly externalDependencies: readonly (DependencySpecifierReference & { readonly name: string; })[];
};

type ScanContext = {
    readonly folder: string;
    readonly graph: DependencyGraph;
    readonly options: Required<ScanOptions>;
    readonly project: TypescriptProject;
};

type DependencyNodeDataInput = {
    readonly externalDependencies: readonly (DependencySpecifierReference & { readonly name: string; })[];
    readonly moduleReferences: readonly ModuleReference[];
    readonly options: Required<ScanOptions>;
    readonly project: TypescriptProject | undefined;
    readonly inputFilePath: string;
    readonly sourcesFolder: string;
};

export function createDependencyScanner(
    dependencyScannerDependencies: Readonly<DependencyScannerDependencies>
): DependencyScanner {
    const { sourceMapFileLocator, typescriptProjectAnalyzer } = dependencyScannerDependencies;

    async function getDependencyNodeData(input: DependencyNodeDataInput): Promise<DependencyGraphNodeData> {
        const sourceMapFilePath = input.options.includeSourceMapFiles && isCodeFile(input.inputFilePath)
            ? await sourceMapFileLocator.locate(input.inputFilePath, input.sourcesFolder)
            : Maybe.nothing<string>();

        return {
            sourceMapFilePath,
            externalDependencies: input.externalDependencies,
            moduleReferences: input.moduleReferences,
            project: input.project
        };
    }

    function collectReferenceLists(references: readonly ModuleReference[]): ReferenceLists {
        const localReferences: ScannableLocalReference[] = [];
        const externalDependencies: (DependencySpecifierReference & { readonly name: string; })[] = [];

        for (const reference of references) {
            if (reference.kind === moduleReferenceKind.externalPackage) {
                externalDependencies.push({
                    name: reference.packageName,
                    sourceSpecifier: reference.sourceSpecifier,
                    emittedSpecifier: reference.emittedSpecifier
                });
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
        const inputFilePath = reference.filePath;
        const referencedModules = getReferencedModules(context.project, reference);
        const { localReferences, externalDependencies } = collectReferenceLists(referencedModules);
        const nodeData = await getDependencyNodeData({
            externalDependencies,
            moduleReferences: referencedModules,
            options: context.options,
            project: getNodeProject(context.project, reference),
            inputFilePath,
            sourcesFolder: context.folder
        });
        context.graph.addDependency(inputFilePath, toDependencyNode(reference, nodeData));
        for (const localReference of localReferences) {
            if (!context.graph.isKnown(localReference.filePath)) {
                await scanDependenciesOfReference(context, localReference);
            }
            if (!context.graph.hasConnection(inputFilePath, localReference.filePath)) {
                context.graph.connect(inputFilePath, localReference.filePath);
            }
        }
    }

    async function scanEntryReferences(
        entryPointFiles: readonly string[],
        context: ScanContext
    ): Promise<void> {
        for (const entryPointFile of entryPointFiles) {
            if (!context.graph.isKnown(entryPointFile)) {
                await scanDependenciesOfReference(
                    context,
                    {
                        kind: moduleReferenceKind.localCode,
                        filePath: entryPointFile,
                        sourceSpecifier: entryPointFile,
                        emittedSpecifier: entryPointFile
                    }
                );
            }
        }
    }

    async function scanEntries(
        entryPointFiles: readonly string[],
        folder: string,
        options: ScanOptionsInput
    ): Promise<DependencyGraph> {
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

        await scanEntryReferences(entryPointFiles, {
            folder,
            graph,
            options: scanOptions,
            project
        });

        return graph;
    }

    return {
        async scan(entryPointFile, folder, options) {
            return scanEntries([ entryPointFile ], folder, options);
        },

        scanEntries
    };
}

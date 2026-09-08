import type { Project } from 'ts-morph';
import { flatMap, pipe } from 'remeda';
import type {
    DependencySpecifierReference,
    ExternalDependencies
} from '../dependency-scanner/external-dependencies.ts';
import { type DirectedGraph, createDirectedGraph } from '../directed-graph/graph.ts';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { BundleResource, ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';

export type ResourceGraphNodeData = {
    readonly fileDescription: TransferableFileDescription;
    readonly moduleReferences: BundleResource['moduleReferences'];
    readonly project?: Project | undefined;
    readonly externalDependencies: readonly (DependencySpecifierReference & { readonly name: string; })[];
    readonly isExplicitlyIncluded: boolean;
    readonly isGeneratedManifest?: true | undefined;
};

export type ResourceGraph = DirectedGraph<string, ResourceGraphNodeData> & {
    readonly inputFilePathByTargetFilePath: ReadonlyMap<string, string>;
    readonly targetFilePathByInputFilePath: ReadonlyMap<string, string>;
};

function collectResourceSpecificExternalDependencies(
    resource: BundleResource,
    externalDependencies: ExternalDependencies
): readonly (DependencySpecifierReference & { readonly name: string; })[] {
    return pipe(
        Array.from(externalDependencies.values()),
        flatMap(function (dependency) {
            const references = dependency.references?.filter(function (reference) {
                return reference.targetFilePath === resource.fileDescription.targetFilePath;
            });
            if (references !== undefined) {
                return references.map(function (reference) {
                    return {
                        name: dependency.name,
                        sourceSpecifier: reference.sourceSpecifier,
                        emittedSpecifier: reference.emittedSpecifier
                    };
                });
            }
            if (dependency.referencedFrom.includes(resource.fileDescription.targetFilePath)) {
                return [ {
                    name: dependency.name,
                    sourceSpecifier: dependency.name,
                    emittedSpecifier: dependency.name
                } ];
            }
            return [];
        })
    );
}

function targetPathIndexes(bundle: ResolvedBundle): Pick<
    ResourceGraph,
    'inputFilePathByTargetFilePath' | 'targetFilePathByInputFilePath'
> {
    const inputFilePathByTargetFilePath = new Map<string, string>();
    const targetFilePathByInputFilePath = new Map<string, string>();
    for (const resource of bundle.contents) {
        inputFilePathByTargetFilePath.set(
            resource.fileDescription.targetFilePath,
            resource.fileDescription.inputFilePath
        );
        targetFilePathByInputFilePath.set(
            resource.fileDescription.inputFilePath,
            resource.fileDescription.targetFilePath
        );
    }
    return { inputFilePathByTargetFilePath, targetFilePathByInputFilePath };
}

function addResourceNodes(graph: ResourceGraph, bundle: ResolvedBundle): void {
    for (const resource of bundle.contents) {
        const externalDependencies = collectResourceSpecificExternalDependencies(resource, bundle.externalDependencies);

        graph.addNode(resource.fileDescription.inputFilePath, {
            fileDescription: resource.fileDescription,
            moduleReferences: resource.moduleReferences,
            externalDependencies,
            project: resource.project,
            isExplicitlyIncluded: resource.isExplicitlyIncluded,
            ...resource.isGeneratedManifest ? { isGeneratedManifest: true } : {}
        });
    }
}

function connectDirectDependencies(graph: ResourceGraph, bundle: ResolvedBundle): void {
    for (const resource of bundle.contents) {
        for (const directDependency of resource.directDependencies) {
            const inputFilePath = graph.inputFilePathByTargetFilePath.get(directDependency);
            if (inputFilePath !== undefined) {
                graph.connect({ from: resource.fileDescription.inputFilePath, to: inputFilePath });
            }
        }
    }
}

export function createGraphFromResolvedBundle(bundle: ResolvedBundle): ResourceGraph {
    const indexes = targetPathIndexes(bundle);
    const graph = Object.assign(createDirectedGraph<string, ResourceGraphNodeData>(), indexes);

    addResourceNodes(graph, bundle);
    connectDirectDependencies(graph, bundle);

    return graph;
}

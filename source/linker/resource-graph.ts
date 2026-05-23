import type { Project } from 'ts-morph';
import { filter, map, pipe } from 'remeda';
import type { ExternalDependencies } from '../dependency-scanner/external-dependencies.ts';
import { type DirectedGraph, createDirectedGraph } from '../directed-graph/graph.ts';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { BundleResource, ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';

export type ResourceGraphNodeData = {
    readonly fileDescription: TransferableFileDescription;
    readonly project?: Project | undefined;
    readonly externalDependencies: readonly string[];
    readonly isExplicitlyIncluded: boolean;
    readonly isGeneratedManifest?: true | undefined;
};

export type ResourceGraph = DirectedGraph<string, ResourceGraphNodeData>;

function collectResourceSpecificExternalDependencies(
    resource: BundleResource,
    externalDependencies: ExternalDependencies
): readonly string[] {
    return pipe(
        Array.from(externalDependencies.values()),
        filter((dependency) => {
            return dependency.referencedFrom.includes(resource.fileDescription.sourceFilePath);
        }),
        map((dependency) => {
            return dependency.name;
        })
    );
}

export function createGraphFromResolvedBundle(bundle: ResolvedBundle): ResourceGraph {
    const graph = createDirectedGraph<string, ResourceGraphNodeData>();

    for (const resource of bundle.contents) {
        const externalDependencies = collectResourceSpecificExternalDependencies(resource, bundle.externalDependencies);

        graph.addNode(resource.fileDescription.sourceFilePath, {
            fileDescription: resource.fileDescription,
            externalDependencies,
            project: resource.project,
            isExplicitlyIncluded: resource.isExplicitlyIncluded,
            ...(resource.isGeneratedManifest ? { isGeneratedManifest: true } : {})
        });
    }

    for (const resource of bundle.contents) {
        for (const directDependency of resource.directDependencies) {
            graph.connect({ from: resource.fileDescription.sourceFilePath, to: directDependency });
        }
    }

    return graph;
}

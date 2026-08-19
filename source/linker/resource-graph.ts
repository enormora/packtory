import type { Project } from 'ts-morph';
import { filter, flatMap, pipe } from 'remeda';
import type {
    DependencySpecifierReference,
    ExternalDependencies
} from '../dependency-scanner/external-dependencies.ts';
import { type DirectedGraph, createDirectedGraph } from '../directed-graph/graph.ts';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import type { BundleResource, ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';

export type ResourceGraphNodeData = {
    readonly fileDescription: TransferableFileDescription;
    readonly project?: Project | undefined;
    readonly externalDependencies: readonly (DependencySpecifierReference & { readonly name: string; })[];
    readonly isExplicitlyIncluded: boolean;
    readonly isGeneratedManifest?: true | undefined;
};

export type ResourceGraph = DirectedGraph<string, ResourceGraphNodeData>;

function collectResourceSpecificExternalDependencies(
    resource: BundleResource,
    externalDependencies: ExternalDependencies
): readonly (DependencySpecifierReference & { readonly name: string; })[] {
    return pipe(
        Array.from(externalDependencies.values()),
        filter(function (dependency) {
            return dependency.referencedFrom.includes(resource.fileDescription.sourceFilePath);
        }),
        flatMap(function (dependency) {
            const references = dependency.references?.filter(function (reference) {
                return reference.sourceFilePath === resource.fileDescription.sourceFilePath;
            });
            if (references === undefined || references.length === 0) {
                return [ {
                    name: dependency.name,
                    sourceSpecifier: dependency.name,
                    emittedSpecifier: dependency.name
                } ];
            }
            return references.map(function (reference) {
                return {
                    name: dependency.name,
                    sourceSpecifier: reference.sourceSpecifier,
                    emittedSpecifier: reference.emittedSpecifier
                };
            });
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
            ...resource.isGeneratedManifest ? { isGeneratedManifest: true } : {}
        });
    }

    for (const resource of bundle.contents) {
        for (const directDependency of resource.directDependencies) {
            graph.connect({ from: resource.fileDescription.sourceFilePath, to: directDependency });
        }
    }

    return graph;
}

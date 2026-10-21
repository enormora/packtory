import path from 'node:path';
import { isDefined } from 'remeda';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';

type Resource = LinkedBundle['contents'][number];
type DiscoveryRelation = 'additional-file' | 'declaration-companion' | 'import' | 'root' | 'source-map';
type DiscoveryStep = {
    readonly packagePath: string;
    readonly sourcePath: string | undefined;
    readonly via: DiscoveryRelation;
};
type FileDiscovery = {
    readonly type: 'discovered';
    readonly chain: readonly DiscoveryStep[];
} | {
    readonly type: 'unavailable';
    readonly reason: 'no-discovery-path';
};

export type PackageInspectedFile = {
    readonly packagePath: string;
    readonly sourcePath: string | undefined;
    readonly kind: 'file' | 'generated-manifest';
    readonly discovery: FileDiscovery;
};

type DiscoveryPath = {
    readonly resource: Resource;
    readonly chain: readonly DiscoveryStep[];
};
type DiscoveryEdge = {
    readonly target: string;
    readonly via: DiscoveryRelation;
};

function resourcePath(resource: Resource): string {
    return resource.fileDescription.targetFilePath;
}

function sourcePath(resource: Resource, repositoryFolder: string): string | undefined {
    return resource.isGeneratedManifest
        ? undefined
        : path.relative(repositoryFolder, resource.fileDescription.inputFilePath).split(path.sep).join(path.posix.sep);
}

function discoverySeeds(bundle: LinkedBundle, repositoryFolder: string): ReadonlyMap<string, DiscoveryPath> {
    const roots = new Set(
        Object.values(bundle.roots).flatMap(function (root) {
            return root.declarationFile === undefined
                ? [ root.javaScript.targetFilePath ]
                : [ root.javaScript.targetFilePath, root.declarationFile.targetFilePath ];
        })
    );
    const seeds = bundle.contents.filter(function (resource) {
        return roots.has(resourcePath(resource)) || resource.isExplicitlyIncluded;
    });
    return new Map(
        seeds
            .toSorted(function (left, right) {
                return resourcePath(left).localeCompare(resourcePath(right));
            })
            .map(function (resource) {
                return [ resourcePath(resource), {
                    resource,
                    chain: [ {
                        packagePath: `./${resourcePath(resource)}`,
                        sourcePath: sourcePath(resource, repositoryFolder),
                        via: roots.has(resourcePath(resource)) ? 'root' : 'additional-file'
                    } ]
                } ];
            })
    );
}

function discoveryEdges(
    resource: Resource,
    resourcesByInputPath: ReadonlyMap<string, Resource>
): readonly DiscoveryEdge[] {
    const dependencies = Array.from(resource.directDependencies, function (target): DiscoveryEdge {
        return { target, via: target === `${resourcePath(resource)}.map` ? 'source-map' : 'import' };
    });
    const companions = declarationCompanionCandidates(resource.fileDescription.inputFilePath)
        .map(function (candidate) {
            return resourcesByInputPath.get(candidate);
        })
        .filter(isDefined)
        .map(function (companion): DiscoveryEdge {
            return { target: resourcePath(companion), via: 'declaration-companion' };
        });
    return [ ...dependencies, ...companions ].toSorted(function (left, right) {
        return left.target.localeCompare(right.target);
    });
}

type DiscoveryTraversal = {
    readonly discovered: {
        readonly has: (target: string) => boolean;
        readonly set: (target: string, discoveryPath: DiscoveryPath) => unknown;
    };
    readonly repositoryFolder: string;
    readonly resourcesByPath: ReadonlyMap<string, Resource>;
    readonly resourcesByInputPath: ReadonlyMap<string, Resource>;
};

function discoverAdjacentFiles(traversal: DiscoveryTraversal, current: DiscoveryPath): void {
    discoveryEdges(current.resource, traversal.resourcesByInputPath).forEach(function (edge) {
        const resource = traversal.resourcesByPath.get(edge.target);
        if (resource === undefined || traversal.discovered.has(edge.target)) {
            return;
        }
        const discoveryPath = {
            resource,
            chain: [ ...current.chain, {
                packagePath: `./${resourcePath(resource)}`,
                sourcePath: sourcePath(resource, traversal.repositoryFolder),
                via: edge.via
            } ]
        };
        traversal.discovered.set(edge.target, discoveryPath);
    });
}

function discoverFiles(bundle: LinkedBundle, repositoryFolder: string): ReadonlyMap<string, DiscoveryPath> {
    const discovered = new Map(discoverySeeds(bundle, repositoryFolder));
    const traversal: DiscoveryTraversal = {
        discovered,
        repositoryFolder,
        resourcesByPath: new Map(bundle.contents.map(function (resource) {
            return [ resourcePath(resource), resource ];
        })),
        resourcesByInputPath: new Map(bundle.contents.map(function (resource) {
            return [ resource.fileDescription.inputFilePath, resource ];
        }))
    };
    for (const current of discovered.values()) {
        discoverAdjacentFiles(traversal, current);
    }
    return discovered;
}

export function inspectFileDiscovery(
    bundle: LinkedBundle,
    retained: AnalyzedBundle['contents'],
    repositoryFolder: string
): readonly PackageInspectedFile[] {
    const discovered = discoverFiles(bundle, repositoryFolder);
    return retained
        .map(function (resource): PackageInspectedFile {
            const discoveryPath = discovered.get(resourcePath(resource));
            return {
                packagePath: `./${resourcePath(resource)}`,
                sourcePath: sourcePath(resource, repositoryFolder),
                kind: resource.isGeneratedManifest ? 'generated-manifest' : 'file',
                discovery: discoveryPath === undefined
                    ? { type: 'unavailable', reason: 'no-discovery-path' }
                    : { type: 'discovered', chain: discoveryPath.chain }
            };
        })
        .toSorted(function (left, right) {
            return left.packagePath.localeCompare(right.packagePath);
        });
}

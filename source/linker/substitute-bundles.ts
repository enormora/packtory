import { Maybe } from 'true-myth';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import type { ResourceGraph } from './resource-graph.ts';
import { createSubstitutedResourceGraph, type SubstitutedResourceGraph } from './substituted-resource-graph.ts';
import { replaceImportPaths } from './source-modifier/import-paths.ts';

type Replacement = {
    readonly targetPath: string;
    readonly packageName: string;
};

function findReplacement(file: string, bundleDependencies: readonly BundleSubstitutionSource[]): Maybe<Replacement> {
    for (const bundle of bundleDependencies) {
        const matchingContent = bundle.contents.find((content) => {
            return content.fileDescription.sourceFilePath === file;
        });
        if (matchingContent !== undefined) {
            const targetPath = `${bundle.name}/${matchingContent.fileDescription.targetFilePath}`;
            return Maybe.just({
                targetPath,
                packageName: bundle.name
            });
        }
    }

    return Maybe.nothing();
}

type Replacements = {
    readonly importPathReplacements: Map<string, string>;
    readonly bundleDependencies: readonly string[];
};

function findAllPathReplacements(
    files: readonly string[],
    bundleDependencies: readonly BundleSubstitutionSource[]
): Replacements {
    const allReplacements = new Map<string, string>();
    const usedBundleDependencies: string[] = [];

    for (const file of files) {
        const result = findReplacement(file, bundleDependencies);
        if (result.isJust) {
            const { targetPath, packageName } = result.value;
            allReplacements.set(file, targetPath);
            usedBundleDependencies.push(packageName);
        }
    }

    return { importPathReplacements: allReplacements, bundleDependencies: usedBundleDependencies };
}

export function substituteDependencies(
    resourceGraph: ResourceGraph,
    bundleDependencies: readonly BundleSubstitutionSource[]
): SubstitutedResourceGraph {
    const substitutedGraph = createSubstitutedResourceGraph();
    const outstandingConnections: { from: string; to: string }[] = [];

    resourceGraph.traverse((node) => {
        if (!substitutedGraph.isKnown(node.id)) {
            const directDependencies = Array.from(node.adjacentNodeIds);
            const replacements = findAllPathReplacements(directDependencies, bundleDependencies);

            for (const file of directDependencies) {
                if (!replacements.importPathReplacements.has(file)) {
                    outstandingConnections.push({ from: node.id, to: file });
                }
            }

            if (replacements.importPathReplacements.size > 0) {
                const substitutionContent = replaceImportPaths(
                    node.data.project,
                    node.data.fileDescription.sourceFilePath,
                    node.data.fileDescription.content,
                    replacements.importPathReplacements
                );

                substitutedGraph.add(node.id, {
                    fileDescription: {
                        sourceFilePath: node.data.fileDescription.sourceFilePath,
                        targetFilePath: node.data.fileDescription.targetFilePath,
                        isExecutable: node.data.fileDescription.isExecutable,
                        content: substitutionContent
                    },
                    externalDependencies: node.data.externalDependencies,
                    bundleDependencies: replacements.bundleDependencies,
                    isSubstituted: true
                });
            } else {
                substitutedGraph.add(node.id, {
                    fileDescription: node.data.fileDescription,
                    externalDependencies: node.data.externalDependencies,
                    bundleDependencies: [],
                    isSubstituted: false
                });
            }
        }
    });

    for (const connection of outstandingConnections) {
        if (!substitutedGraph.hasConnection(connection.from, connection.to)) {
            substitutedGraph.connect(connection.from, connection.to);
        }
    }

    return substitutedGraph;
}

import { Maybe } from 'true-myth';
import { getPublicModuleSpecifierForSourcePath } from '../package-surface/modules.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import type { ResourceGraph } from './resource-graph.ts';
import { createSubstitutedResourceGraph, type SubstitutedResourceGraph } from './substituted-resource-graph.ts';
import { replaceImportPaths } from './source-modifier/import-paths.ts';

type Replacement = {
    readonly targetPath: string;
    readonly packageName: string;
};

function ownsSourcePath(file: string, bundle: BundleSubstitutionSource): boolean {
    return bundle.contents.some((content) => {
        return content.fileDescription.sourceFilePath === file;
    });
}

function findReplacement(file: string, bundleDependencies: readonly BundleSubstitutionSource[]): Maybe<Replacement> {
    for (const bundle of bundleDependencies) {
        const targetPath = getPublicModuleSpecifierForSourcePath(bundle, file);
        if (targetPath !== undefined) {
            return Maybe.just({
                targetPath,
                packageName: bundle.name
            });
        }
        if (ownsSourcePath(file, bundle)) {
            throw new Error(`Package "${bundle.name}" does not expose "${file}" for cross-package substitution`);
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
    const matched = files.flatMap((file) => {
        const result = findReplacement(file, bundleDependencies);
        if (!result.isJust) {
            return [];
        }
        const { targetPath, packageName } = result.value;
        return [{ file, targetPath, packageName }];
    });

    return {
        importPathReplacements: new Map(
            matched.map((entry) => {
                return [entry.file, entry.targetPath];
            })
        ),
        bundleDependencies: matched.map((entry) => {
            return entry.packageName;
        })
    };
}

export function substituteDependencies(
    resourceGraph: ResourceGraph,
    bundleDependencies: readonly BundleSubstitutionSource[]
): SubstitutedResourceGraph {
    const substitutedGraph = createSubstitutedResourceGraph();
    const outstandingConnections: { from: string; to: string }[] = [];

    resourceGraph.traverse((node) => {
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
                isSubstituted: true,
                isExplicitlyIncluded: node.data.isExplicitlyIncluded
            });
        } else {
            substitutedGraph.add(node.id, {
                fileDescription: node.data.fileDescription,
                externalDependencies: node.data.externalDependencies,
                bundleDependencies: [],
                isSubstituted: false,
                isExplicitlyIncluded: node.data.isExplicitlyIncluded
            });
        }
    });

    for (const connection of outstandingConnections) {
        substitutedGraph.connect(connection.from, connection.to);
    }

    return substitutedGraph;
}

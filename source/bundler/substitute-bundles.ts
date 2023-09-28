import { Maybe } from 'true-myth';
import { type DependencyGraph, createDependencyGraph } from '../dependency-scanner/dependency-graph.js';
import { replaceImportPaths } from '../source-modifier/import-paths.js';
import type { BundleDescription } from './bundle-description.js';

type Replacement = {
    readonly targetPath: string;
    readonly packageName: string;
    readonly packageVersion: string;
};

function findReplacement(file: string, dependencies: readonly BundleDescription[]): Readonly<Maybe<Replacement>> {
    for (const bundle of dependencies) {
        const matchingContent = bundle.contents.find((content) => {
            return content.sourceFilePath === file;
        });
        if (matchingContent !== undefined && matchingContent.kind !== 'source') {
            const targetPath = `${bundle.packageJson.name}/${matchingContent.targetFilePath}`;
            return Maybe.just({
                targetPath,
                packageName: bundle.packageJson.name,
                packageVersion: bundle.packageJson.version
            });
        }
    }

    return Maybe.nothing();
}

type Replacements = {
    readonly importPathReplacements: Map<string, string>;
    readonly topLevelDependencies: Map<string, string>;
};

function findAllPathReplacements(
    files: readonly string[],
    dependencies: readonly BundleDescription[]
): Readonly<Replacements> {
    const allReplacements = new Map<string, string>();
    const topLevelDependencies = new Map<string, string>();

    for (const file of files) {
        const result = findReplacement(file, dependencies);
        if (result.isJust) {
            const { targetPath, packageName, packageVersion } = result.value;
            allReplacements.set(file, targetPath);
            topLevelDependencies.set(packageName, packageVersion);
        }
    }

    return { importPathReplacements: allReplacements, topLevelDependencies };
}

function mergeTopLevelDependencies(
    first: ReadonlyMap<string, string>,
    second: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
    return new Map([...first.entries(), ...second.entries()]);
}

export function substituteDependencies(
    graph: DependencyGraph,
    entryPointFile: string,
    dependencies: readonly BundleDescription[],
    resolveDeclarationFiles: boolean
): DependencyGraph {
    const substitutedGraph = createDependencyGraph();
    const outstandingConnections: { from: string; to: string }[] = [];

    graph.walk(entryPointFile, (node) => {
        if (!substitutedGraph.isKnown(node.filePath)) {
            const replacements = findAllPathReplacements(node.localFiles, dependencies);

            for (const file of node.localFiles) {
                if (!replacements.importPathReplacements.has(file)) {
                    outstandingConnections.push({ from: node.filePath, to: file });
                }
            }

            if (replacements.importPathReplacements.size > 0) {
                const substitutionContent = Maybe.just(
                    replaceImportPaths(node.tsSourceFile, replacements.importPathReplacements, resolveDeclarationFiles)
                );

                substitutedGraph.addDependency(node.filePath, {
                    sourceMapFilePath: node.sourceMapFilePath,
                    topLevelDependencies: mergeTopLevelDependencies(
                        node.topLevelDependencies,
                        replacements.topLevelDependencies
                    ),
                    tsSourceFile: node.tsSourceFile,
                    substitutionContent
                });
            } else {
                substitutedGraph.addDependency(node.filePath, {
                    sourceMapFilePath: node.sourceMapFilePath,
                    topLevelDependencies: node.topLevelDependencies,
                    tsSourceFile: node.tsSourceFile,
                    substitutionContent: node.substitutionContent
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

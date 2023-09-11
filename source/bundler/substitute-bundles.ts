import {BundleDescription} from './bundle-description.js';
import {DependencyGraph, createDependencyGraph} from '../dependency-scanner/dependency-graph.js';
import {replaceImportPaths} from '../source-modifier/import-paths.js';
import {Maybe} from 'true-myth';

interface Replacement {
    targetPath: string;
    packageName: string;
    packageVersion: string;
}

function findReplacement(file: string, dependencies: BundleDescription[]): Maybe<Replacement> {
    for (const bundle of dependencies) {
        const matchingContent = bundle.contents.find((content) => {
            return content.sourceFilePath === file
        });
        if (matchingContent && matchingContent.kind !== 'source') {
            const targetPath = `${bundle.packageJson.name}/${matchingContent.targetFilePath}`;
            return Maybe.just({targetPath, packageName: bundle.packageJson.name, packageVersion: bundle.packageJson.version});
        }
    }

    return Maybe.nothing()
}

interface Replacements {
    importPathReplacements: Map<string, string>;
    topLevelDependencies: Map<string, string>;
}

function findAllPathReplacements(files: readonly string[], dependencies: BundleDescription[]): Replacements {
    const allReplacements = new Map<string, string>();
    const topLevelDependencies = new Map<string, string>();

    for (const file of files) {
        const result = findReplacement(file, dependencies);
        if (result.isJust) {
            const {targetPath, packageName, packageVersion} = result.value;
            allReplacements.set(file, targetPath);
            topLevelDependencies.set(packageName, packageVersion);
        }
    }

    return {importPathReplacements: allReplacements, topLevelDependencies};
}

function mergeTopLevelDependencies(first: Map<string, string>, second: Map<string, string>): Map<string, string> {
    return new Map([ ...first.entries(), ...second.entries() ]);
}

export function substituteDependencies(graph: DependencyGraph, entryPointFile: string, dependencies: BundleDescription[], resolveDeclarationFiles: boolean): DependencyGraph {
    const substitutedGraph = createDependencyGraph();
    const outstandingConnections: {from: string, to: string}[] = [];

    graph.walk(entryPointFile, (node) => {
        if (!substitutedGraph.isKnown(node.filePath)) {
            const replacements = findAllPathReplacements(node.localFiles, dependencies);

            for (const file of node.localFiles) {
                if (!replacements.importPathReplacements.has(file)) {
                    outstandingConnections.push({from: node.filePath, to: file});
                }
            }

            if (replacements.importPathReplacements.size > 0) {
                const substitutionContent = Maybe.just(replaceImportPaths(node.tsSourceFile, replacements.importPathReplacements, resolveDeclarationFiles));

                substitutedGraph.addDependency(node.filePath, {
                    sourceMapFilePath: node.sourceMapFilePath,
                    topLevelDependencies: mergeTopLevelDependencies(node.topLevelDependencies, replacements.topLevelDependencies),
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

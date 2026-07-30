import { createDirectedGraph, type DirectedGraph } from '../../directed-graph/graph.ts';
import { declarationCandidatesFor, isRelativeSpecifier } from './type-script-declaration-paths.ts';

export type DeclarationReferences = {
    readonly declarationPaths: ReadonlySet<string>;
    readonly rootPaths: ReadonlySet<string>;
    readonly moduleSpecifiersOf: (declarationPath: string) => readonly string[];
};

function referencedDeclarationPaths(references: DeclarationReferences, declarationPath: string): ReadonlySet<string> {
    const referencedPaths = references
        .moduleSpecifiersOf(declarationPath)
        .filter(isRelativeSpecifier)
        .flatMap(function (specifier) {
            return declarationCandidatesFor(declarationPath, specifier);
        })
        .filter(function (candidate) {
            return references.declarationPaths.has(candidate);
        });

    return new Set(referencedPaths);
}

function buildDeclarationGraph(references: DeclarationReferences): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    for (const declarationPath of references.declarationPaths) {
        graph.addNode(declarationPath, undefined);
    }

    for (const declarationPath of references.declarationPaths) {
        for (const referencedPath of referencedDeclarationPaths(references, declarationPath)) {
            graph.connect({ from: declarationPath, to: referencedPath });
        }
    }

    return graph;
}

export function reachableDeclarationPaths(references: DeclarationReferences): ReadonlySet<string> {
    const graph = buildDeclarationGraph(references);
    const reachable = new Set<string>();

    for (const rootPath of references.rootPaths) {
        if (references.declarationPaths.has(rootPath)) {
            graph.visitBreadthFirstSearch(rootPath, function (node) {
                reachable.add(node.id);
            });
        }
    }

    return reachable;
}

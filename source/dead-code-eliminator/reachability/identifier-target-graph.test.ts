import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createExportGraph, type ExportGraph } from '../exports/export-graph.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { buildDeclarationNodeIndex } from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';

function emptyGraph(): ExportGraph {
    return createExportGraph({
        files: [],
        publicPaths: new Set(),
        classifySideEffects,
        settings: undefined,
        observedBindings: undefined
    });
}

suite('identifier target graph boundaries', function () {
    test('uses authoritative graph targets for a re-export declaration', function () {
        const source = createProject().createSourceFile('/index.js', 'export * from "missing";');
        const declaration = source.getExportDeclarations()[0];
        assertDefined(declaration);
        const graph = {
            ...emptyGraph(),
            declarationTargets(node: typeof declaration) {
                assert.strictEqual(node, declaration);
                return [ 'graph-export' ];
            }
        };
        assert.deepStrictEqual(
            collectIdentifierTargets(declaration, buildDeclarationNodeIndex([]), graph),
            new Set([ 'graph-export' ])
        );
    });

    for (
        const content of [
            'import type * as library from "./library.js";library;',
            'import {type value} from "./library.js";value;',
            'import * as library from "./library.js";type Value=typeof library;'
        ]
    ) {
        test(`preserves type-only resolution for ${content}`, function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/index.ts', content },
                    { filePath: '/library.js', content: 'export const value=42;' }
                ]
            });
            const source = project.getSourceFileOrThrow('/index.ts');
            const root = source.getStatements()[1];
            assertDefined(root);
            const graph = {
                ...emptyGraph(),
                owns() {
                    return true;
                },
                namespaceBindingTargets() {
                    assert.fail('type-only declarations cannot demand runtime namespace members');
                }
            };
            const query = root.getKind() === SyntaxKind.TypeAliasDeclaration
                ? root.getFirstDescendantByKindOrThrow(SyntaxKind.TypeQuery)
                : root;
            collectIdentifierTargets(query, buildDeclarationNodeIndex([]), graph);
        });
    }

    test('does not use namespace graph targets for declarations outside graph ownership', function () {
        const source = createProject().createSourceFile('/index.ts', 'const value=42;value;');
        const root = source.getStatements()[1];
        assertDefined(root);
        const graph = {
            ...emptyGraph(),
            namespaceBindingTargets() {
                assert.fail('foreign declarations cannot demand runtime namespace members');
            }
        };
        assert.deepStrictEqual(collectIdentifierTargets(root, buildDeclarationNodeIndex([]), graph), new Set());
    });

    test('requires ownership of every merged namespace declaration', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/owned.ts', content: 'namespace library{export const first=1;}library;' },
                { filePath: '/foreign.ts', content: 'namespace library{export const second=2;}' }
            ]
        });
        const source = project.getSourceFileOrThrow('/owned.ts');
        const root = source.getStatements()[1];
        assertDefined(root);
        const graph = {
            ...emptyGraph(),
            owns(file: typeof source) {
                return file === source;
            },
            namespaceBindingTargets() {
                assert.fail('merged declarations require complete graph ownership');
            }
        };
        assert.deepStrictEqual(collectIdentifierTargets(root, buildDeclarationNodeIndex([]), graph), new Set());
    });
});

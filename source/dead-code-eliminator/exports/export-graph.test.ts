import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type SourceFile } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { createExportGraph, type ExportGraph } from './export-graph.ts';

type GraphFixture = { readonly graph: ExportGraph; readonly source: (path: string) => SourceFile; };

function graphFor(contents: Readonly<Record<string, string>>, publicPaths: readonly string[]): GraphFixture {
    const files = multiFileBindingsFor(
        Object.entries(contents).map(function ([ filePath, content ]) {
            return { filePath, content };
        })
    );
    return {
        graph: createExportGraph({
            files,
            publicPaths: new Set(publicPaths),
            classifySideEffects,
            settings: undefined,
            observedBindings: undefined
        }),
        source(path) {
            const file = files.find(function (candidate) {
                return candidate.targetFilePath === path;
            });
            assertDefined(file);
            return file.sourceFile.getSourceFile();
        }
    };
}

suite('export reachability graph', function () {
    suite('module and binding edges', function () {
        test('keeps unresolved local exports without inventing binding targets', function () {
            const { graph } = graphFor({ 'index.js': 'export {missing};' }, [ 'index.js' ]);
            assert.deepStrictEqual(
                new Set(graph.roots()),
                new Set([ 'index.js::@evaluate', 'index.js::@export:"missing"' ])
            );
            assert.deepStrictEqual(graph.nodes.get('index.js::@export:"missing"')?.(), []);
        });

        test('connects named forwarding exports to their defining bindings', function () {
            const { graph } = graphFor({
                'index.js': 'export {used} from "./library.js";',
                'library.js': 'export const used=42;export const unused=13;'
            }, [ 'index.js' ]);
            assert.deepStrictEqual(
                new Set(graph.roots()),
                new Set([ 'index.js::@evaluate', 'index.js::@export:"used"' ])
            );
            assert.deepStrictEqual(graph.nodes.get('index.js::@export:"used"')?.(), [ 'library.js::@export:"used"' ]);
            assert.deepStrictEqual(graph.nodes.get('library.js::@export:"used"')?.(), [ 'library.js::used' ]);
            assert.deepStrictEqual(graph.nodes.get('index.js::@evaluate')?.(), [ 'library.js::@evaluate' ]);
        });

        test('keeps failing named imports as module-link requirements', function () {
            const { graph } = graphFor({
                'index.js': 'import {missing as alias} from "./library.js";export const probe=42;',
                'library.js': 'export const value=1;'
            }, [ 'index.js' ]);
            assert.deepStrictEqual(
                new Set(graph.nodes.get('index.js::@evaluate')?.()),
                new Set([ 'library.js::@evaluate', 'index.js::alias' ])
            );
        });

        test('keeps failing named reexports as module-link requirements', function () {
            const { graph } = graphFor({
                'index.js': 'export {missing as unused} from "./library.js";export const probe=42;',
                'library.js': 'export const value=1;'
            }, [ 'index.js' ]);
            assert.deepStrictEqual(
                new Set(graph.nodes.get('index.js::@evaluate')?.()),
                new Set([ 'library.js::@evaluate', 'index.js::@export:"unused"' ])
            );
        });

        test('roots anonymous default definitions with effects through module evaluation', function () {
            const { graph } = graphFor({
                'index.js': 'import "./library.js";export const probe=42;',
                'library.js': 'export default class{static{console.log(this.name);}}'
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.nodes.get('library.js::@evaluate')?.(), [ 'library.js::@export:"default"' ]);
            assert.deepStrictEqual(graph.nodes.get('library.js::@export:"default"')?.(), []);
        });

        test('keeps effects in default export assignments reachable', function () {
            const { graph } = graphFor({
                'index.js': 'import "./library.js";export const probe=42;',
                'library.js': 'export default console.log("loaded");'
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.nodes.get('library.js::@evaluate')?.(), [ 'library.js::@export:"default"' ]);
        });

        test('maps surviving exports independently of locally reachable bindings', function () {
            const { graph } = graphFor({
                'index.js': 'export {used} from "./library.js";',
                'library.js': 'export const used=42;export const unused=13;'
            }, [ 'index.js' ]);
            const surviving = graph.survivingExports(
                new Set([ 'index.js::@export:"used"', 'library.js::@export:"used"', 'library.js::unused' ])
            );
            assert.deepStrictEqual(
                surviving,
                new Map([ [ 'index.js', new Set([ 'used' ]) ], [ 'library.js', new Set([ 'used' ]) ] ])
            );
        });
    });

    suite('namespace and dynamic consumers', function () {
        for (
            const [ path, content ] of [
                [ 'index.js', 'import type * as ns from "./library.js";' ],
                [ 'index.d.ts', 'import * as ns from "./library.js";' ]
            ] as const
        ) {
            test(`omits erased namespace imports in ${path}`, function () {
                const { graph, source } = graphFor({
                    [path]: content,
                    'library.js': 'export const value=42;'
                }, [ path ]);
                const name = source(path).getImportDeclarations()[0]?.getNamespaceImport();
                assertDefined(name);
                assert.deepStrictEqual(graph.namespaceBindingTargets(name.getParentOrThrow()), []);
            });
        }

        test('projects namespace bindings to their observed target exports', function () {
            const { graph, source } = graphFor({
                'index.js': 'import * as ns from "./library.js";export function probe(){return ns.used;}',
                'library.js': 'export const used=42;export const unused=13;'
            }, [ 'index.js' ]);
            const name = source('index.js').getImportDeclarations()[0]?.getNamespaceImport();
            assertDefined(name);
            assert.deepStrictEqual(graph.namespaceBindingTargets(name.getParentOrThrow()), [
                'library.js::@export:"used"'
            ]);
            assert.deepStrictEqual(graph.importedTargets(name.getParentOrThrow()), []);
        });

        test('adds evaluation and finite export targets for dynamic imports', function () {
            const { graph, source } = graphFor({
                'index.js': 'export async function probe(){const ns=await import("./library.js");return ns.used;}',
                'library.js': 'export const used=42;export const unused=13;'
            }, [ 'index.js' ]);
            const call = source('index.js').getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            assert.deepStrictEqual(
                new Set(graph.dynamicTargets(call)),
                new Set([ 'library.js::@evaluate', 'library.js::@export:"used"' ])
            );
        });

        test('materializes all forwarding nodes before graph traversal starts', function () {
            const { graph, source } = graphFor({
                'index.js': 'export {value} from "./first.js";',
                'first.js': 'export {value} from "./second.js";',
                'second.js': 'export const value=42;'
            }, [ 'index.js' ]);
            const count = graph.nodes.size;
            const declaration = source('index.js').getExportDeclarations()[0];
            assertDefined(declaration);
            assert.deepStrictEqual(graph.declarationTargets(declaration), [ 'index.js::@export:"value"' ]);
            graph.roots();
            graph.nodes.forEach(function (neighbors) {
                neighbors();
            });
            assert.strictEqual(graph.nodes.size, count);
            assert.deepStrictEqual(graph.nodes.get('first.js::@export:"value"')?.(), [ 'second.js::@export:"value"' ]);
        });
    });

    test('leaves declaration-file export lookup to declaration reachability', function () {
        const { graph, source } = graphFor({
            'index.d.ts': 'export type {Value} from "./types.d.ts";',
            'types.d.ts': 'export interface Value {field:string;}'
        }, [ 'index.d.ts' ]);
        const declaration = source('index.d.ts').getExportDeclarations()[0];
        assertDefined(declaration);
        assert.strictEqual(graph.owns(source('index.d.ts')), false);
        assert.strictEqual(graph.declarationTargets(declaration), undefined);
        assert.strictEqual(graph.survivingExports(new Set()).has('index.d.ts'), false);
    });
});

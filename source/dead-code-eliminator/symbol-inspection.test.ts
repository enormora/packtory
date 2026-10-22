import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { createTestEliminator, createTracedTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { createDeadCodeEliminationTraceCollector } from '../test-libraries/dead-code-elimination-trace-fixtures.ts';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    bundleForCodeFile,
    inputs,
    inputWithoutTransformations,
    producerBundleWith,
    consumerBundleWith
} from '../test-libraries/eliminator-test-support.ts';
import { createSymbolRetentionCollector } from './symbol-inspection.ts';

function sampleBundle(): LinkedBundle {
    return bundleForCodeFile({
        name: 'example',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content: 'const helper = 1;\nconst unused = 2;\nexport const api = helper;\n'
    });
}

suite('symbol inspection', function () {
    test('explains entry exports, referenced bindings, and unreachable bindings using original locations', async function () {
        const [ inspection ] = await createTestEliminator().inspectSymbols(inputs(sampleBundle()));
        assertDefined(inspection);
        assert.deepStrictEqual(inspection.symbols, [
            {
                packagePath: './index.js',
                name: 'api',
                line: 3,
                kind: 'VariableDeclaration',
                decision: 'kept',
                reason: 'reachable',
                chain: [ { binding: 'index.js::api', reason: 'entry-export', consumerPackage: undefined } ]
            },
            {
                packagePath: './index.js',
                name: 'helper',
                line: 1,
                kind: 'VariableDeclaration',
                decision: 'kept',
                reason: 'reachable',
                chain: [
                    { binding: 'index.js::api', reason: 'entry-export', consumerPackage: undefined },
                    { binding: 'index.js::helper', reason: 'identifier-reference', consumerPackage: undefined }
                ]
            },
            {
                packagePath: './index.js',
                name: 'unused',
                line: 2,
                kind: 'VariableDeclaration',
                decision: 'removed',
                reason: 'unreachable',
                chain: []
            }
        ]);
        assert.doesNotMatch(inspection.bundle.contents[0]?.fileDescription.content ?? '', /unused/u);
    });

    test('labels retained unreachable bindings when transformations are disabled', async function () {
        const [ inspection ] = await createTestEliminator().inspectSymbols(inputWithoutTransformations(sampleBundle()));
        assertDefined(inspection);
        assert.ok(inspection.symbols.every(function (symbol) {
            return symbol.decision === 'kept' && symbol.reason === 'dead-code-elimination-disabled';
        }));
        assert.strictEqual(inspection.symbols.length, 3);
        assert.match(inspection.bundle.contents[0]?.fileDescription.content ?? '', /unused/u);
    });

    test('explains impure statements and includes symbols from eliminated files', async function () {
        const bundle = bundleForCodeFile({
            name: 'example',
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js',
            content: 'const effect = console.log("hello");',
            extraResources: [ {
                ...bundleResource('/source/dead.js', {
                    targetFilePath: 'dead.js',
                    content: 'export const unused = 1;'
                }),
                isSubstituted: false
            } ]
        });
        const [ inspection ] = await createTestEliminator().inspectSymbols(inputs(bundle));
        assertDefined(inspection);
        assert.deepStrictEqual(
            inspection.symbols.map(function (symbol) {
                return [ symbol.packagePath, symbol.name, symbol.decision, symbol.chain ];
            }),
            [
                [ './dead.js', 'unused', 'removed', [] ],
                [ './index.js', 'effect', 'kept', [ {
                    binding: 'index.js::effect',
                    reason: 'impure-statement',
                    consumerPackage: undefined
                } ] ]
            ]
        );
    });

    test('reports cross-package seeds without confusing identical binding names in different packages', async function () {
        const producer = producerBundleWith('export const used = 1;\nexport const unused = 2;');
        const consumer = consumerBundleWith('import { used } from "producer/helpers.ts";\nexport const api = used;');
        const inspected = await createTestEliminator().inspectSymbols(inputs(producer, consumer));
        const producerInspection = inspected.find(function (entry) {
            return entry.bundle.name === 'producer';
        });
        assertDefined(producerInspection);
        const used = producerInspection.symbols.find(function (symbol) {
            return symbol.name === 'used';
        });
        assertDefined(used);
        assert.deepStrictEqual({ decision: used.decision, chain: used.chain }, {
            decision: 'kept',
            chain: [ { binding: 'helpers.ts::used', reason: 'named-import', consumerPackage: 'consumer' } ]
        });
        assert.strictEqual(
            producerInspection
                .symbols
                .find(function (symbol) {
                    return symbol.name === 'unused';
                })
                ?.decision,
            'removed'
        );
    });

    test('keeps package-local explanations separate for identical binding identifiers', async function () {
        const makeBundle = function (name: string, content: string): LinkedBundle {
            return bundleForCodeFile({ name, content, inputFilePath: `/${name}/index.js`, targetFilePath: 'index.js' });
        };
        const inspected = await createTestEliminator().inspectSymbols(inputs(
            makeBundle('effect', 'const api = console.log("hello");'),
            makeBundle('entry', 'export const api = 1;')
        ));
        assert.deepStrictEqual(
            inspected.map(function (entry) {
                return entry.symbols[0]?.chain;
            }),
            [
                [ { binding: 'index.js::api', reason: 'impure-statement', consumerPackage: undefined } ],
                [ { binding: 'index.js::api', reason: 'entry-export', consumerPackage: undefined } ]
            ]
        );
    });

    test('explains re-export declarations and terminates on reference cycles', async function () {
        const bundle = bundleForCodeFile({
            name: 'example',
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js',
            content: 'export { first } from "./other.js";',
            extraResources: [ {
                ...bundleResource('/source/other.js', {
                    targetFilePath: 'other.js',
                    content: 'export function first() { return second(); }\nfunction second() { return first(); }'
                }),
                isSubstituted: false
            } ]
        });
        const [ inspection ] = await createTestEliminator().inspectSymbols(inputs(bundle));
        assertDefined(inspection);
        assert.deepStrictEqual(
            inspection.symbols.map(function (symbol) {
                return [
                    symbol.name,
                    symbol.decision,
                    symbol.chain.map(function (step) {
                        return step.reason;
                    })
                ];
            }),
            [
                [ 'first', 'kept', [ 'entry-export-declaration' ] ],
                [ 'second', 'kept', [ 'entry-export-declaration', 'identifier-reference' ] ]
            ]
        );
    });

    test('reports declaration bindings at their original source locations', async function () {
        const runtime = bundleResource('/source/index.js', {
            targetFilePath: 'index.js',
            content: 'export function api() { return 1; }'
        });
        const declaration = {
            ...bundleResource('/source/index.d.ts', {
                targetFilePath: 'index.d.ts',
                content: 'export declare function api(): number;'
            }),
            isSubstituted: false
        };
        const unusedDeclaration = {
            ...bundleResource('/source/unused.d.ts', {
                targetFilePath: 'unused.d.ts',
                content: '\ninterface Unused { value: string; }'
            }),
            isSubstituted: false
        };
        const bundle = linkedBundle({
            name: 'example',
            contents: [ { ...runtime, isSubstituted: false }, declaration, unusedDeclaration ],
            roots: { main: { javaScript: runtime.fileDescription, declarationFile: declaration.fileDescription } }
        });
        const [ inspection ] = await createTestEliminator().inspectSymbols(inputs(bundle));
        assertDefined(inspection);
        assert.deepStrictEqual(
            inspection
                .symbols
                .filter(function (symbol) {
                    return symbol.packagePath.endsWith('.d.ts');
                })
                .map(function (symbol) {
                    return { name: symbol.name, kind: symbol.kind, line: symbol.line, decision: symbol.decision };
                }),
            [
                { name: 'api', kind: 'FunctionDeclaration', line: 1, decision: 'kept' },
                { name: 'Unused', kind: 'InterfaceDeclaration', line: 2, decision: 'removed' }
            ]
        );
    });

    test('rejects a reference without its source retention proof', function () {
        const collector = createSymbolRetentionCollector();
        assert.throws(function () {
            collector.record({
                type: 'edge-added',
                bundleName: 'example',
                fromBindingIdentifier: 'index.js::unknown',
                toBindingIdentifier: 'index.js::target',
                reason: 'identifier-reference'
            });
        }, { message: 'Missing retention proof for "index.js::unknown" in package "example"' });
        assert.strictEqual(collector.pathsForPackage('missing').size, 0);
    });

    test('preserves configured trace collection and handles empty inspections', async function () {
        const trace = createDeadCodeEliminationTraceCollector();
        const inspected = await createTracedTestEliminator(trace.collector).inspectSymbols(inputs(sampleBundle()));
        assert.strictEqual(inspected.length, 1);
        assert.ok(trace.events.some(function (event) {
            return event.type === 'binding-removed';
        }));
        assert.deepStrictEqual(await createTestEliminator().inspectSymbols([]), []);
    });
});

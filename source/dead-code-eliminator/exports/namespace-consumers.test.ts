import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { collectNamespaceConsumers, type NamespaceConsumers } from './namespace-consumers.ts';

type ConsumerGraph = NamespaceConsumers & { readonly source: (name: string) => SourceFile; };

function graphFor(files: Readonly<Record<string, string>>): ConsumerGraph {
    const fixture = createExportModuleFixture(files, []);
    return { ...collectNamespaceConsumers(fixture.sources, fixture.resolveModule), source: fixture.source };
}

suite('namespace consumers', function () {
    test('indexes static imports, reexports, and dynamic imports by their target', function () {
        const graph = graphFor({
            'index.js':
                'import * as ns from "./library.js";export {value as renamed} from "./library.js";export async function probe(){console.log(ns);return await import("./library.js");}',
            'library.js': 'export const value=42;'
        });
        const consumers = graph.consumers.get(graph.source('library.js'));
        assertDefined(consumers);
        assert.deepStrictEqual(
            consumers.map(function (consumer) {
                return consumer.type;
            }),
            [ 'import', 'export', 'dynamic' ]
        );
        for (const consumer of consumers) {
            const node = consumer.type === 'dynamic' ? consumer.call : consumer.declaration;
            assert.strictEqual(node.getSourceFile(), graph.source('index.js'));
        }
        assert.strictEqual(graph.unknownDynamic, false);
    });

    test('retains side-effect imports and empty reexport module requests', function () {
        const graph = graphFor({
            'index.js': 'import "./library.js";export {} from "./library.js";',
            'library.js': 'export {};'
        });
        assert.deepStrictEqual(
            graph.consumers.get(graph.source('library.js'))?.map(function (consumer) {
                return consumer.type;
            }),
            [ 'import', 'export' ]
        );
    });

    test('omits type-only requests and local export clauses', function () {
        const graph = graphFor({
            'index.ts':
                'import type {Value} from "./library.js";export type * from "./library.js";const local=1;export {local};',
            'library.js': 'export const Value=42;'
        });
        assert.deepStrictEqual({ count: graph.consumers.size, unknown: graph.unknownDynamic }, {
            count: 0,
            unknown: false
        });
    });

    test('does not index unresolved external targets as local consumers', function () {
        const graph = graphFor({
            'index.js':
                'import * as ns from "external-package";export * from "external-package";export async function probe(){return import("external-package");}'
        });
        assert.deepStrictEqual({ count: graph.consumers.size, unknown: graph.unknownDynamic }, {
            count: 0,
            unknown: false
        });
    });

    test('marks a nonliteral dynamic import as observing unknown modules', function () {
        const graph = graphFor({
            'index.js': 'export function probe(path){return import(path);}',
            'library.js': 'export const value=42;'
        });
        assert.strictEqual(graph.unknownDynamic, true);
    });

    test('keeps template dynamic imports conservative until their artifact target is known', function () {
        const graph = graphFor({
            'index.js': 'export function probe(){return import(`./library.js`);}'
        });
        assert.strictEqual(graph.unknownDynamic, true);
    });

    test('indexes a computed constant specifier when its artifact target is known', function () {
        const graph = graphFor({
            'index.js': 'export function probe(){const path="./library.js";return import(path);}',
            'library.js': 'export const value=42;'
        });
        assert.strictEqual(graph.unknownDynamic, false);
        assert.deepStrictEqual(
            graph.consumers.get(graph.source('library.js'))?.map(function (consumer) {
                return consumer.type;
            }),
            [ 'dynamic' ]
        );
    });

    test('keeps separate observation sites that target the same module', function () {
        const graph = graphFor({
            'index.js': 'import * as first from "./library.js";import * as second from "./library.js";',
            'library.js': 'export const value=42;'
        });
        const consumers = graph.consumers.get(graph.source('library.js'));
        assertDefined(consumers);
        assert.strictEqual(consumers.length, 2);
        assert.notStrictEqual(consumers[0], consumers[1]);
    });
});

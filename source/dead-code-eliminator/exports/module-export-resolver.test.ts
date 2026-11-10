import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import {
    createModuleExportResolver,
    resolveModuleExport,
    type NamespaceBindingIdentity
} from './module-export-resolver.ts';
import type { ExportResolution } from './export-resolution.ts';

type ExportFixture = {
    readonly source: (name: string) => SourceFile;
    readonly resolve: (name: string) => ExportResolution<SourceFile | undefined>;
};

function resolverFor(files: Readonly<Record<string, string>>, identity: NamespaceBindingIdentity): ExportFixture {
    const fixture = createExportModuleFixture(files, []);
    const resolver = createModuleExportResolver(Array.from(fixture.models.values()), fixture.resolveModule, identity);
    return {
        source: fixture.source,
        resolve(name) {
            return resolver.resolve(fixture.source('index.js'), name);
        }
    };
}

suite('module export provenance', function () {
    suite('module export requests', function () {
        for (const name of [ 'value', undefined ]) {
            test(`resolves ${String(name)} only when its module exists`, function () {
                const fixture = createExportModuleFixture({
                    'index.js': 'export {};',
                    'provider.js': 'export const value=1;'
                }, []);
                const source = fixture.source('index.js');
                assert.deepStrictEqual(resolveModuleExport(source, './provider.js', name, fixture.resolveModule), {
                    source: fixture.source('provider.js'),
                    name
                });
                assert.strictEqual(resolveModuleExport(source, './missing.js', name, fixture.resolveModule), undefined);
            });
        }
    });

    test('follows named and default import aliases to the defining export', function () {
        const graph = resolverFor({
            'index.js': 'import snapshot,{value as alias} from "./library.js";export {alias as named,snapshot};',
            'library.js': 'export const value=42;export default value;'
        }, 'canonical');
        assert.deepStrictEqual(graph.resolve('named'), {
            kind: 'unique',
            origin: { module: graph.source('library.js'), name: 'value' }
        });
        assert.deepStrictEqual(graph.resolve('snapshot'), {
            kind: 'unique',
            origin: { module: graph.source('library.js'), name: '*default*' }
        });
    });

    test('preserves default function and class declaration binding identity', function () {
        const graph = resolverFor({
            'index.js': 'export {default as fn} from "./function.js";export {default as cls} from "./class.js";',
            'function.js': 'export default function named(){}',
            'class.js': 'export default class Named{}'
        }, 'canonical');
        assert.deepStrictEqual(graph.resolve('fn'), {
            kind: 'unique',
            origin: { module: graph.source('function.js'), name: 'named' }
        });
        assert.deepStrictEqual(graph.resolve('cls'), {
            kind: 'unique',
            origin: { module: graph.source('class.js'), name: 'Named' }
        });
    });

    test('resolves anonymous default declarations to their own snapshot binding', function () {
        const graph = resolverFor({ 'index.js': 'export default class{}' }, 'canonical');
        assert.deepStrictEqual(graph.resolve('default'), {
            kind: 'unique',
            origin: { module: graph.source('index.js'), name: '*default*' }
        });
    });

    test('detects ambiguity between equal values in distinct default snapshots', function () {
        const graph = resolverFor({
            'index.js': 'export * from "./first.js";export * from "./second.js";',
            'first.js': 'export {default as value} from "./a.js";',
            'second.js': 'export {default as value} from "./b.js";',
            'a.js': 'export default 42;',
            'b.js': 'export default 42;'
        }, 'canonical');
        assert.deepStrictEqual(graph.resolve('value'), { kind: 'ambiguous' });
    });

    test('resolves namespace exports to namespace identity', function () {
        const graph = resolverFor({
            'index.js': 'export * as grouped from "./library.js";',
            'library.js': 'export const value=42;'
        }, 'local');
        assert.deepStrictEqual(graph.resolve('grouped'), {
            kind: 'unique',
            origin: { name: undefined, module: graph.source('library.js') }
        });
    });

    for (const identity of [ 'canonical', 'local' ] as const) {
        test(`resolves namespace import exports with ${identity} binding identity`, function () {
            const graph = resolverFor({
                'index.js': 'import * as ns from "./library.js";export {ns as grouped};',
                'library.js': 'export const value=42;'
            }, identity);
            const origin = identity === 'canonical'
                ? { name: undefined, module: graph.source('library.js') }
                : { module: graph.source('index.js'), name: 'ns' };
            assert.deepStrictEqual(graph.resolve('grouped'), { kind: 'unique', origin });
        });
    }

    test('retains uncertainty for missing targets and missing local bindings', function () {
        const graph = resolverFor({
            'index.js':
                'import * as ns from "./external.js";export {ns,missing};export {value} from "./external.js";export * as grouped from "./external.js";'
        }, 'local');
        for (const name of [ 'ns', 'missing', 'value', 'grouped' ]) {
            assert.deepStrictEqual(graph.resolve(name), { kind: 'unknown' });
        }
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { createModuleExportIndex, type ModuleExportIndex } from './module-export-index.ts';

type ExportGraph = {
    readonly index: ModuleExportIndex;
    readonly source: (name: string) => SourceFile;
};

function graphFor(files: Readonly<Record<string, string>>, omitted: readonly string[]): ExportGraph {
    const fixture = createExportModuleFixture(files, omitted);
    return {
        index: createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule),
        source: fixture.source
    };
}

suite('module export index', function () {
    test('distinguishes bindings from namespace and missing exports', function () {
        const { index, source } = graphFor({
            'index.js': 'export {value} from "./library.js";export * as ns from "./library.js";',
            'library.js': 'export const value=42;'
        }, []);
        assert.strictEqual(index.binding(source('index.js'), 'value')?.name, 'value');
        assert.strictEqual(index.binding(source('index.js'), 'ns'), undefined);
        assert.strictEqual(index.binding(source('index.js'), 'missing'), undefined);
    });

    test('excludes ambiguous star names from a closed namespace', function () {
        const { index, source } = graphFor({
            'index.js': 'export * from "./a.js";export * from "./b.js";',
            'a.js': 'export const first=1;export const clash=1;',
            'b.js': 'export const second=2;export const clash=2;'
        }, []);
        assert.deepStrictEqual(index.names(source('index.js')), new Set([ 'first', 'second' ]));
        assert.deepStrictEqual(index.candidates(source('index.js')), new Set([ 'first', 'clash', 'second' ]));
        assert.strictEqual(index.status(source('index.js'), 'clash'), 'ambiguous');
        assert.strictEqual(index.status(source('index.js'), 'missing'), 'missing');
        assert.strictEqual(
            index.sameExport({ source: source('a.js'), name: 'clash' }, { source: source('b.js'), name: 'clash' }),
            false
        );
    });

    test('recognizes identical bindings forwarded along different paths', function () {
        const { index, source } = graphFor({
            'index.js': 'export * from "./a.js";export * from "./b.js";',
            'a.js': 'export {value as result} from "./shared.js";',
            'b.js': 'export {value as result} from "./shared.js";',
            'shared.js': 'export const value=42;'
        }, []);
        assert.deepStrictEqual(index.names(source('index.js')), new Set([ 'result' ]));
        assert.strictEqual(
            index.sameExport({ source: source('a.js'), name: 'result' }, { source: source('b.js'), name: 'result' }),
            true
        );
        assert.strictEqual(
            index.sameExport({ source: source('a.js'), name: 'result' }, { source: source('b.js'), name: 'missing' }),
            false
        );
        assert.strictEqual(
            index.sameExport({ source: source('a.js'), name: 'missing' }, { source: source('b.js'), name: 'result' }),
            false
        );
    });

    test('does not equate distinct snapshot bindings with equal values', function () {
        const { index, source } = graphFor({
            'index.js': 'export * from "./a.js";export * from "./b.js";',
            'a.js': 'const value=42;export default value;export {value as result};',
            'b.js': 'export {default as result} from "./a.js";'
        }, []);
        assert.deepStrictEqual(index.names(source('index.js')), new Set());
        assert.strictEqual(
            index.sameExport({ source: source('a.js'), name: 'result' }, { source: source('b.js'), name: 'result' }),
            false
        );
    });

    test('recognizes direct namespace reexports of the same module', function () {
        const { index, source } = graphFor({
            'index.js': 'export * from "./a.js";export * from "./b.js";',
            'a.js': 'export * as result from "./shared.js";',
            'b.js': 'export * as result from "./shared.js";',
            'shared.js': 'export const value=42;'
        }, []);
        assert.deepStrictEqual(index.names(source('index.js')), new Set([ 'result' ]));
        assert.strictEqual(
            index.sameExport({ source: source('a.js'), name: 'result' }, { source: source('b.js'), name: 'result' }),
            true
        );
    });

    test('preserves namespace identity differences between supported runtime semantics', function () {
        const { index, source } = graphFor({
            'index.js': 'export * from "./a.js";export * from "./b.js";',
            'a.js': 'import * as ns from "./shared.js";export {ns as result};',
            'b.js': 'export * as result from "./shared.js";',
            'shared.js': 'export const value=42;'
        }, []);
        assert.strictEqual(index.names(source('index.js')), undefined);
        assert.strictEqual(index.status(source('index.js'), 'result'), 'unknown');
        assert.strictEqual(
            index.sameExport({ source: source('a.js'), name: 'result' }, { source: source('b.js'), name: 'result' }),
            false
        );
    });

    test('honors explicit overrides of conflicting star exports', function () {
        const { index, source } = graphFor({
            'index.js': 'export * from "./a.js";export * from "./b.js";export const value=3;',
            'a.js': 'export const value=1;',
            'b.js': 'export const value=2;'
        }, []);
        assert.deepStrictEqual(index.names(source('index.js')), new Set([ 'value' ]));
        assert.strictEqual(index.status(source('index.js'), 'value'), 'unique');
    });

    test('keeps known candidates when an external star schema is unknown', function () {
        const { index, source } = graphFor({ 'index.js': 'export * from "./external.js";export const value=1;' }, []);
        assert.strictEqual(index.names(source('index.js')), undefined);
        assert.deepStrictEqual(index.candidates(source('index.js')), new Set([ 'value' ]));
        assert.strictEqual(index.status(source('index.js'), 'value'), 'unique');
        assert.strictEqual(index.names(source('index.js')), undefined);
    });

    test('does not declare a namespace closed when an explicit target is unresolved', function () {
        const { index, source } = graphFor({ 'index.js': 'export {value} from "./external.js";' }, []);
        assert.strictEqual(index.names(source('index.js')), undefined);
        assert.strictEqual(index.status(source('index.js'), 'value'), 'unknown');
    });

    test('handles source files outside the supplied models conservatively', function () {
        const { index, source } = graphFor({ 'index.js': 'export {};', 'outside.js': 'export const value=1;' }, [
            'outside.js'
        ]);
        assert.strictEqual(index.names(source('outside.js')), undefined);
        assert.deepStrictEqual(index.candidates(source('outside.js')), new Set());
        assert.strictEqual(index.status(source('outside.js'), 'value'), 'unknown');
        assert.deepStrictEqual(index.models.get(source('index.js'))?.source, source('index.js'));
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { createModuleExportIndex } from './module-export-index.ts';
import { bindingForExportOrigin } from './module-export-resolver.ts';
import { collectCandidateExportNames } from './candidate-export-names.ts';

suite('module export index boundaries', function () {
    test('does not close a namespace containing both known and unknown exports', function () {
        const fixture = createExportModuleFixture({
            'index.js': 'export {missing} from "./external.js";export const known=1;'
        }, []);
        const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
        assert.strictEqual(index.names(fixture.source('index.js')), undefined);
    });

    test('reuses the readonly namespace snapshot', function () {
        const fixture = createExportModuleFixture({ 'index.js': 'export const value=42;' }, []);
        const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
        const source = fixture.source('index.js');
        const names = index.names(source);
        assert.deepStrictEqual(names, new Set([ 'value' ]));
        assert.strictEqual(index.names(source), names);
    });

    test('projects export origins without inventing absent modules', function () {
        const fixture = createExportModuleFixture({
            'index.js': 'export default 42;',
            'outside.js': 'export const value=1;'
        }, [ 'outside.js' ]);
        assert.strictEqual(
            bindingForExportOrigin({ kind: 'binding', module: undefined, name: 'value' }, fixture.models),
            undefined
        );
        assert.strictEqual(
            bindingForExportOrigin({
                kind: 'binding',
                module: fixture.source('outside.js'),
                name: 'value'
            }, fixture.models),
            undefined
        );
        assert.strictEqual(
            bindingForExportOrigin({ kind: 'namespace', module: fixture.source('index.js') }, fixture.models),
            undefined
        );
        assert.strictEqual(
            bindingForExportOrigin({
                kind: 'binding',
                module: fixture.source('index.js'),
                name: '*default*'
            }, fixture.models)
                ?.name,
            'default'
        );
    });

    test('preserves the local binding identity of an exported namespace import', function () {
        const fixture = createExportModuleFixture({
            'index.js': 'import * as library from "./library.js";export {library as exposed};',
            'library.js': 'export const value=42;'
        }, []);
        const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
        assert.strictEqual(index.binding(fixture.source('index.js'), 'exposed')?.name, 'library');
    });

    test('propagates opacity even when no candidate names change', function () {
        const fixture = createExportModuleFixture({
            'a.js': 'export * from "./b.js";',
            'b.js': 'export * from "./c.js";',
            'c.js': 'export * from "./external.js";'
        }, []);
        const candidates = collectCandidateExportNames(Array.from(fixture.models.values()), fixture.resolveModule);
        assert.deepStrictEqual(new Set(candidates.names.keys()), new Set(fixture.sources));
        assert.deepStrictEqual(candidates.opaque, new Set(fixture.sources));
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { createModuleExportIndex } from '../exports/module-export-index.ts';
import { exportedModuleValue } from './module-export-value.ts';

suite('exported module values', function () {
    test('retains the source and binding name of a callable export', function () {
        const fixture = createExportModuleFixture({ 'index.js': 'export function value(){return 42;}' }, []);
        const source = fixture.source('index.js');
        assert.deepStrictEqual(
            exportedModuleValue(source, 'value', {
                index: createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule),
                resolveModule: fixture.resolveModule
            }, function () {
                return undefined;
            }),
            { kind: 'callable', source, name: 'value' }
        );
    });

    test('leaves an unproved noncallable export unknown', function () {
        const fixture = createExportModuleFixture({ 'index.js': 'export const value=globalThis.value;' }, []);
        assert.strictEqual(
            exportedModuleValue(fixture.source('index.js'), 'value', {
                index: createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule),
                resolveModule: fixture.resolveModule
            }, function () {
                return undefined;
            }),
            undefined
        );
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { createModuleExportIndex } from '../exports/module-export-index.ts';
import { exportedModuleValue } from './module-export-value.ts';

suite('exported module values', function () {
    test('retains the source and binding name of a callable export', function () {
        const fixture = createExportModuleFixture({ 'index.js': 'export function value(){return 42;}' }, []);
        const source = fixture.source('index.js');
        const exportIndex = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
        const exportedValue = exportedModuleValue(source, 'value', {
            index: exportIndex,
            resolveModule: fixture.resolveModule
        }, function () {
            return undefined;
        });
        assert.deepStrictEqual(
            exportedValue,
            { kind: 'callable', source, name: 'value' }
        );
    });

    test('leaves an unproved noncallable export unknown', function () {
        const fixture = createExportModuleFixture({ 'index.js': 'export const value=globalThis.value;' }, []);
        const moduleExportIndex = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
        const exportedValue = exportedModuleValue(fixture.source('index.js'), 'value', {
            index: moduleExportIndex,
            resolveModule: fixture.resolveModule
        }, function () {
            return undefined;
        });
        assert.strictEqual(
            exportedValue,
            undefined
        );
    });
});

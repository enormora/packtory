import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createEmptyMutablePackageReport } from './report-types.ts';

suite('report-types', function () {
    test('createEmptyMutablePackageReport returns an empty decisions object', function () {
        assert.deepStrictEqual(createEmptyMutablePackageReport().decisions, {});
    });

    test('createEmptyMutablePackageReport returns an empty timings record', function () {
        assert.deepStrictEqual(createEmptyMutablePackageReport().timings, {});
    });

    test('createEmptyMutablePackageReport returns a fresh object on every call', function () {
        const first = createEmptyMutablePackageReport();
        const second = createEmptyMutablePackageReport();

        assert.notStrictEqual(first, second);
    });
});

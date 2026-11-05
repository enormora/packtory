import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createEmptyPackageReport } from './report-types.ts';

suite('report-types', function () {
    test('createEmptyPackageReport returns an empty decisions object', function () {
        assert.deepStrictEqual(createEmptyPackageReport().decisions, {});
    });

    test('createEmptyPackageReport returns an empty timings record', function () {
        assert.deepStrictEqual(createEmptyPackageReport().timings, {});
    });

    test('createEmptyPackageReport returns a fresh object on every call', function () {
        const first = createEmptyPackageReport();
        const second = createEmptyPackageReport();

        assert.notStrictEqual(first, second);
    });
});

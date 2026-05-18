import assert from 'node:assert';
import { test } from 'mocha';
import { createEmptyMutablePackageReport } from './report-types.ts';

test('createEmptyMutablePackageReport returns an empty decisions object', () => {
    assert.deepStrictEqual(createEmptyMutablePackageReport().decisions, {});
});

test('createEmptyMutablePackageReport returns an empty timings record', () => {
    assert.deepStrictEqual(createEmptyMutablePackageReport().timings, {});
});

test('createEmptyMutablePackageReport returns a fresh object on every call', () => {
    const first = createEmptyMutablePackageReport();
    const second = createEmptyMutablePackageReport();

    assert.notStrictEqual(first, second);
});

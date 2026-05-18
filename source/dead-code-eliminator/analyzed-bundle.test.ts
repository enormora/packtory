import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createEmptyFileAnalysis } from './analyzed-bundle.ts';

suite('analyzed-bundle', function () {
    test('createEmptyFileAnalysis returns an empty survivingBindings set', function () {
        assert.strictEqual(createEmptyFileAnalysis().survivingBindings.size, 0);
    });

    test('createEmptyFileAnalysis returns an empty sideEffectImports set', function () {
        assert.strictEqual(createEmptyFileAnalysis().sideEffectImports.size, 0);
    });

    test('createEmptyFileAnalysis returns an empty sideEffectStatements array', function () {
        assert.deepStrictEqual(Array.from(createEmptyFileAnalysis().sideEffectStatements), []);
    });

    test('createEmptyFileAnalysis returns independent instances on each call', function () {
        const first = createEmptyFileAnalysis();
        const second = createEmptyFileAnalysis();
        assert.notStrictEqual(first.survivingBindings, second.survivingBindings);
        assert.notStrictEqual(first.sideEffectImports, second.sideEffectImports);
    });
});

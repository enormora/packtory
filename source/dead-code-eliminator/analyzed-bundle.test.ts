import assert from 'node:assert';
import { test } from 'mocha';
import { createEmptyFileAnalysis } from './analyzed-bundle.ts';

test('createEmptyFileAnalysis returns an empty survivingBindings set', () => {
    assert.strictEqual(createEmptyFileAnalysis().survivingBindings.size, 0);
});

test('createEmptyFileAnalysis returns an empty sideEffectImports set', () => {
    assert.strictEqual(createEmptyFileAnalysis().sideEffectImports.size, 0);
});

test('createEmptyFileAnalysis returns an empty sideEffectStatements array', () => {
    assert.deepStrictEqual(Array.from(createEmptyFileAnalysis().sideEffectStatements), []);
});

test('createEmptyFileAnalysis returns independent instances on each call', () => {
    const first = createEmptyFileAnalysis();
    const second = createEmptyFileAnalysis();
    assert.notStrictEqual(first.survivingBindings, second.survivingBindings);
    assert.notStrictEqual(first.sideEffectImports, second.sideEffectImports);
});

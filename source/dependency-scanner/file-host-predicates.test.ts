import assert from 'node:assert';
import { test } from 'mocha';
import { isDeclarationFile, isTypesRootFolder } from './file-host-predicates.ts';

test('isDeclarationFile recognizes .d.ts, .d.cts, and .d.mts paths regardless of case', () => {
    assert.strictEqual(isDeclarationFile('/p/types.d.ts'), true);
    assert.strictEqual(isDeclarationFile('/P/types.D.CTS'), true);
    assert.strictEqual(isDeclarationFile('/p/Types.D.Mts'), true);
});

test('isDeclarationFile returns false for plain source files', () => {
    assert.strictEqual(isDeclarationFile('/p/index.ts'), false);
    assert.strictEqual(isDeclarationFile('/p/index.js'), false);
});

test('isTypesRootFolder returns true for a directory ending in /node_modules/@types', () => {
    assert.strictEqual(isTypesRootFolder('/project/node_modules/@types'), true);
});

test('isTypesRootFolder returns true for a nested @types package directory', () => {
    assert.strictEqual(isTypesRootFolder('/project/node_modules/@types/node'), true);
});

test('isTypesRootFolder returns false for unrelated directories', () => {
    assert.strictEqual(isTypesRootFolder('/project/source'), false);
    assert.strictEqual(isTypesRootFolder('/project/node_modules/lodash'), false);
});

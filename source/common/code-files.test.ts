import assert from 'node:assert';
import { test } from 'mocha';
import { isCodeFile, isDeclarationCodeFile } from './code-files.ts';

test('isCodeFile recognizes .js as code', () => {
    assert.strictEqual(isCodeFile('index.js'), true);
});

test('isCodeFile recognizes .ts as code', () => {
    assert.strictEqual(isCodeFile('index.ts'), true);
});

test('isCodeFile recognizes .tsx as code', () => {
    assert.strictEqual(isCodeFile('index.tsx'), true);
});

test('isCodeFile recognizes .jsx as code', () => {
    assert.strictEqual(isCodeFile('index.jsx'), true);
});

test('isCodeFile recognizes .cjs as code', () => {
    assert.strictEqual(isCodeFile('index.cjs'), true);
});

test('isCodeFile recognizes .mjs as code', () => {
    assert.strictEqual(isCodeFile('index.mjs'), true);
});

test('isCodeFile recognizes .cts as code', () => {
    assert.strictEqual(isCodeFile('index.cts'), true);
});

test('isCodeFile recognizes .mts as code', () => {
    assert.strictEqual(isCodeFile('index.mts'), true);
});

test('isCodeFile recognizes .d.ts as code', () => {
    assert.strictEqual(isCodeFile('index.d.ts'), true);
});

test('isDeclarationCodeFile recognizes .d.ts as a declaration code file', () => {
    assert.strictEqual(isDeclarationCodeFile('index.d.ts'), true);
});

test('isDeclarationCodeFile rejects .js as a declaration code file', () => {
    assert.strictEqual(isDeclarationCodeFile('index.js'), false);
});

test('isCodeFile rejects .json as not code', () => {
    assert.strictEqual(isCodeFile('data.json'), false);
});

test('isCodeFile rejects LICENSE as not code', () => {
    assert.strictEqual(isCodeFile('LICENSE'), false);
});

test('isCodeFile rejects markdown as not code', () => {
    assert.strictEqual(isCodeFile('readme.md'), false);
});

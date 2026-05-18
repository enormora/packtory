import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isCodeFile, isDeclarationCodeFile } from './code-files.ts';

suite('code-files', function () {
    test('isCodeFile recognizes .js as code', function () {
        assert.strictEqual(isCodeFile('index.js'), true);
    });

    test('isCodeFile recognizes .ts as code', function () {
        assert.strictEqual(isCodeFile('index.ts'), true);
    });

    test('isCodeFile recognizes .tsx as code', function () {
        assert.strictEqual(isCodeFile('index.tsx'), true);
    });

    test('isCodeFile recognizes .jsx as code', function () {
        assert.strictEqual(isCodeFile('index.jsx'), true);
    });

    test('isCodeFile recognizes .cjs as code', function () {
        assert.strictEqual(isCodeFile('index.cjs'), true);
    });

    test('isCodeFile recognizes .mjs as code', function () {
        assert.strictEqual(isCodeFile('index.mjs'), true);
    });

    test('isCodeFile recognizes .cts as code', function () {
        assert.strictEqual(isCodeFile('index.cts'), true);
    });

    test('isCodeFile recognizes .mts as code', function () {
        assert.strictEqual(isCodeFile('index.mts'), true);
    });

    test('isCodeFile recognizes .d.ts as code', function () {
        assert.strictEqual(isCodeFile('index.d.ts'), true);
    });

    test('isDeclarationCodeFile recognizes .d.ts as a declaration code file', function () {
        assert.strictEqual(isDeclarationCodeFile('index.d.ts'), true);
    });

    test('isDeclarationCodeFile rejects .js as a declaration code file', function () {
        assert.strictEqual(isDeclarationCodeFile('index.js'), false);
    });

    test('isCodeFile rejects .json as not code', function () {
        assert.strictEqual(isCodeFile('data.json'), false);
    });

    test('isCodeFile rejects LICENSE as not code', function () {
        assert.strictEqual(isCodeFile('LICENSE'), false);
    });

    test('isCodeFile rejects markdown as not code', function () {
        assert.strictEqual(isCodeFile('readme.md'), false);
    });
});

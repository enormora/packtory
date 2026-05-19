import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isCodeFile, isDeclarationCodeFile, isTextDiffablePath } from './code-files.ts';

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

    test('isTextDiffablePath recognizes each code-file extension at the end of the path', function () {
        assert.strictEqual(isTextDiffablePath('src/index.ts'), true);
        assert.strictEqual(isTextDiffablePath('src/index.tsx'), true);
        assert.strictEqual(isTextDiffablePath('src/index.cts'), true);
        assert.strictEqual(isTextDiffablePath('src/index.mts'), true);
        assert.strictEqual(isTextDiffablePath('src/index.js'), true);
        assert.strictEqual(isTextDiffablePath('src/index.jsx'), true);
        assert.strictEqual(isTextDiffablePath('src/index.cjs'), true);
        assert.strictEqual(isTextDiffablePath('src/index.mjs'), true);
        assert.strictEqual(isTextDiffablePath('src/index.d.ts'), true);
    });

    test('isTextDiffablePath requires the code-file extension to appear at the end of the path', function () {
        assert.strictEqual(isTextDiffablePath('src/index.ts.bak'), false);
        assert.strictEqual(isTextDiffablePath('src/index.js.bak'), false);
        assert.strictEqual(isTextDiffablePath('src/index.d.ts.bak'), false);
    });

    test('isTextDiffablePath recognizes .json only when it terminates the path', function () {
        assert.strictEqual(isTextDiffablePath('package.json'), true);
        assert.strictEqual(isTextDiffablePath('sbom.cdx.json'), true);
        assert.strictEqual(isTextDiffablePath('package.json.bak'), false);
    });

    test('isTextDiffablePath recognizes .md only when it terminates the path', function () {
        assert.strictEqual(isTextDiffablePath('readme.md'), true);
        assert.strictEqual(isTextDiffablePath('readme.md.bak'), false);
    });

    test('isTextDiffablePath recognizes .txt only when it terminates the path', function () {
        assert.strictEqual(isTextDiffablePath('NOTES.txt'), true);
        assert.strictEqual(isTextDiffablePath('NOTES.txt.bak'), false);
    });

    test('isTextDiffablePath recognizes .yml and .yaml only when they terminate the path', function () {
        assert.strictEqual(isTextDiffablePath('action.yml'), true);
        assert.strictEqual(isTextDiffablePath('config.yaml'), true);
        assert.strictEqual(isTextDiffablePath('action.yml.bak'), false);
        assert.strictEqual(isTextDiffablePath('config.yaml.bak'), false);
    });

    test('isTextDiffablePath recognizes .map only when it terminates the path', function () {
        assert.strictEqual(isTextDiffablePath('index.js.map'), true);
        assert.strictEqual(isTextDiffablePath('index.js.map.bak'), false);
    });

    test('isTextDiffablePath recognizes LICENSE-style extension-less files by basename', function () {
        assert.strictEqual(isTextDiffablePath('LICENSE'), true);
        assert.strictEqual(isTextDiffablePath('packages/cli/LICENSE'), true);
        assert.strictEqual(isTextDiffablePath('COPYING'), true);
        assert.strictEqual(isTextDiffablePath('NOTICE'), true);
        assert.strictEqual(isTextDiffablePath('CHANGELOG'), true);
        assert.strictEqual(isTextDiffablePath('readme'), true);
    });

    test('isTextDiffablePath checks the basename, not the full path, for LICENSE-style names', function () {
        assert.strictEqual(isTextDiffablePath('LICENSE/inner.txt'), true);
        assert.strictEqual(isTextDiffablePath('LICENSE-extra'), false);
    });

    test('isTextDiffablePath rejects opaque binary extensions', function () {
        assert.strictEqual(isTextDiffablePath('logo.png'), false);
        assert.strictEqual(isTextDiffablePath('font.woff2'), false);
        assert.strictEqual(isTextDiffablePath('archive.zip'), false);
    });
});

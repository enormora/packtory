import assert from 'node:assert';
import { suite, test } from 'mocha';
import { rootHasDeclarationFile, type RootFileDescription } from './resolved-bundle.ts';

const javaScriptOnly: RootFileDescription = {
    javaScript: { inputFilePath: '/a/index.ts', targetFilePath: 'index.js', content: '', isExecutable: false }
};

suite('resolved-bundle', function () {
    test('rootHasDeclarationFile returns false when only the js entry is present', function () {
        assert.strictEqual(rootHasDeclarationFile(javaScriptOnly), false);
    });

    test('rootHasDeclarationFile returns true when a declarationFile entry is attached', function () {
        const withDeclarations: RootFileDescription = {
            ...javaScriptOnly,
            declarationFile: {
                inputFilePath: '/a/index.d.ts',
                targetFilePath: 'index.d.ts',
                content: '',
                isExecutable: false
            }
        };

        assert.strictEqual(rootHasDeclarationFile(withDeclarations), true);
    });
});

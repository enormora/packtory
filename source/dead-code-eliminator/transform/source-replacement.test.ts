import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { applySourceTextEdits, translateGeneratedOffset } from '../../source-transformation/text-edits.ts';
import { sourceReplacement } from './source-replacement.ts';

suite('source replacement', function () {
    test('retains the selected occurrence when branch text repeats', function () {
        const content = 'if (false) { console.log("same"); } else { console.log("same"); }';
        const sourceFile = createProject().createSourceFile('index.ts', content);
        const branch = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.IfStatement);
        const selected = branch.getElseStatement();
        assertDefined(selected);
        const result = applySourceTextEdits(content, sourceReplacement(branch, [ selected ]));
        assert.strictEqual(result.transformedCode, '{ console.log("same"); }');
        assert.strictEqual(translateGeneratedOffset(content.indexOf('console'), result.atoms), undefined);
        assert.strictEqual(translateGeneratedOffset(content.lastIndexOf('console'), result.atoms), 2);
    });

    test('wraps a retained expression without copying its text', function () {
        const content = 'const unused = console.log("effect");';
        const sourceFile = createProject().createSourceFile('index.ts', content);
        const statement = sourceFile.getVariableStatementOrThrow('unused');
        const initializer = sourceFile.getVariableDeclarationOrThrow('unused').getInitializerOrThrow();
        const result = applySourceTextEdits(content, sourceReplacement(statement, [ '(', initializer, ');' ]));
        assert.strictEqual(result.transformedCode, '(console.log("effect"));');
        assert.strictEqual(translateGeneratedOffset(content.indexOf('console'), result.atoms), 1);
    });

    test('omits edits when the entire range is retained', function () {
        const sourceFile = createProject().createSourceFile('index.ts', 'console.log("effect");');
        const statement = sourceFile.getStatements()[0];
        assertDefined(statement);
        assert.deepStrictEqual(sourceReplacement(statement, [ statement ]), []);
    });

    test('rejects overlapping or reordered retained ranges', function () {
        const sourceFile = createProject().createSourceFile('index.ts', 'if (false) { first(); } else { second(); }');
        const branch = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.IfStatement);
        const alternative = branch.getElseStatement();
        assertDefined(alternative);
        assert.throws(function () {
            sourceReplacement(branch, [ alternative, branch.getThenStatement() ]);
        }, { message: 'Retained source range lies outside replacement' });
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Node as TypeScriptMorphNode } from 'ts-morph';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { collectImpureStatements } from './impure-statements.ts';

function impureLinesFor(content: string): readonly number[] {
    const project = createProject({ withFiles: [ { filePath: '/source.ts', content } ] });
    const sourceFile = project.getSourceFileOrThrow('/source.ts');
    return collectImpureStatements(sourceFile, undefined, classifySideEffects).map(function (statement) {
        return statement.getStartLineNumber();
    });
}

suite('impure-statements', function () {
    test('collectImpureStatements returns no statements for a file with only pure declarations', function () {
        assert.deepStrictEqual(impureLinesFor('export const x = 1;\nexport function f() { return 1; }'), []);
    });

    test('collectImpureStatements flags top-level side-effecting expression statements', function () {
        assert.deepStrictEqual(impureLinesFor('console.log("hi");'), [ 1 ]);
    });

    test('collectImpureStatements selects exact statements sharing a line', function () {
        const project = createProject({
            withFiles: [ {
                filePath: '/source.ts',
                content: [
                    'import "./effect.css";',
                    'const before = 1;',
                    'console.log("first");',
                    'const between = 2;',
                    'console.log("second");',
                    'const after = 3;'
                ]
                    .join(' ')
            } ]
        });
        const sourceFile = project.getSourceFileOrThrow('/source.ts');
        const statements = sourceFile.getStatements();

        assert.deepStrictEqual(
            collectImpureStatements(sourceFile, undefined, classifySideEffects),
            [ statements[2], statements[4] ]
        );
    });

    test('collectImpureStatements excludes import declarations even when classified as side-effecting', function () {
        const project = createProject({
            withFiles: [ { filePath: '/source.ts', content: 'import "./side-effect.css";\nconsole.log("hi");' } ]
        });
        const sourceFile = project.getSourceFileOrThrow('/source.ts');

        const impure = collectImpureStatements(sourceFile, undefined, classifySideEffects);

        assert.strictEqual(impure.length, 1);
        assert.strictEqual(TypeScriptMorphNode.isImportDeclaration(impure[0]), false);
    });
});

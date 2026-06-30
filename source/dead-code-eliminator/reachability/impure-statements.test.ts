import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Node as TsMorphNode } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { collectImpureStatements } from './impure-statements.ts';

function impureLinesFor(content: string): readonly number[] {
    const project = createProject({ withFiles: [ { filePath: '/source.ts', content } ] });
    const sourceFile = project.getSourceFileOrThrow('/source.ts');
    return collectImpureStatements(sourceFile, undefined).map(function (statement) {
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

    test('collectImpureStatements excludes import declarations even when classified as side-effecting', function () {
        const project = createProject({
            withFiles: [ { filePath: '/source.ts', content: 'import "./side-effect.ts";\nconsole.log("hi");' } ]
        });
        const sourceFile = project.getSourceFileOrThrow('/source.ts');

        const impure = collectImpureStatements(sourceFile, undefined);

        assert.strictEqual(impure.length, 1);
        assert.strictEqual(TsMorphNode.isImportDeclaration(impure[0]), false);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { captureSurvivorsForStatement } from './survivor-capture.ts';

function withSource(content: string) {
    const project = createProject({ withFiles: [{ filePath: '/source.ts', content }] });
    return project.getSourceFileOrThrow('/source.ts');
}

suite('survivor-capture', function () {
    test('captureSurvivorsForStatement keeps a named declaration when its name is in the surviving set', function () {
        const sourceFile = withSource('function keep() {}');
        const [statement] = sourceFile.getStatements();

        const survivors = captureSurvivorsForStatement(statement!, new Set(['keep']));

        assert.strictEqual(survivors.length, 1);
        assert.strictEqual(survivors[0]?.node, statement);
    });

    test('captureSurvivorsForStatement drops a named declaration whose name is not in the surviving set', function () {
        const sourceFile = withSource('function drop() {}');
        const [statement] = sourceFile.getStatements();

        const survivors = captureSurvivorsForStatement(statement!, new Set());

        assert.deepStrictEqual(survivors, []);
    });

    test('captureSurvivorsForStatement returns the whole variable statement when every declarator survives', function () {
        const sourceFile = withSource('const a = 1, b = 2;');
        const [statement] = sourceFile.getStatements();

        const survivors = captureSurvivorsForStatement(statement!, new Set(['a', 'b']));

        assert.strictEqual(survivors.length, 1);
        assert.strictEqual(survivors[0]?.node, statement);
    });

    test('captureSurvivorsForStatement returns only the surviving declarators when some are dropped', function () {
        const sourceFile = withSource('const a = 1, b = 2;');
        const [statement] = sourceFile.getStatements();
        const [firstDeclarator] = sourceFile.getVariableStatements()[0]?.getDeclarations() ?? [];

        const survivors = captureSurvivorsForStatement(statement!, new Set(['a']));

        assert.strictEqual(survivors.length, 1);
        assert.strictEqual(survivors[0]?.node, firstDeclarator);
    });

    test('captureSurvivorsForStatement keeps an unclassified expression statement unconditionally', function () {
        const sourceFile = withSource('console.log("hi");');
        const [statement] = sourceFile.getStatements();

        const survivors = captureSurvivorsForStatement(statement!, new Set());

        assert.strictEqual(survivors.length, 1);
        assert.strictEqual(survivors[0]?.node, statement);
    });
});

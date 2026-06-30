import assert from 'node:assert';
import { suite, test } from 'mocha';
import { captureSurvivorsForStatement } from './survivor-capture.ts';
import { firstStatement, firstVariableDeclaration, withSource } from './transform-test-support.ts';

suite('survivor-capture', function () {
    test('captureSurvivorsForStatement keeps a named declaration when its name is in the surviving set', function () {
        const sourceFile = withSource('function keep() {}');
        const statement = firstStatement(sourceFile);

        const survivors = captureSurvivorsForStatement(statement, new Set([ 'keep' ]));

        assert.strictEqual(survivors.length, 1);
        assert.strictEqual(survivors[0]?.node, statement);
    });

    test('captureSurvivorsForStatement drops a named declaration whose name is not in the surviving set', function () {
        const sourceFile = withSource('function drop() {}');
        const statement = firstStatement(sourceFile);

        const survivors = captureSurvivorsForStatement(statement, new Set());

        assert.deepStrictEqual(survivors, []);
    });

    test('captureSurvivorsForStatement returns the whole variable statement when every declarator survives', function () {
        const sourceFile = withSource('const a = 1, b = 2;');
        const statement = firstStatement(sourceFile);

        const survivors = captureSurvivorsForStatement(statement, new Set([ 'a', 'b' ]));

        assert.strictEqual(survivors.length, 1);
        assert.strictEqual(survivors[0]?.node, statement);
    });

    test('captureSurvivorsForStatement returns only the surviving declarators when some are dropped', function () {
        const sourceFile = withSource('const a = 1, b = 2;');
        const statement = firstStatement(sourceFile);
        const firstDeclarator = firstVariableDeclaration(sourceFile);

        const survivors = captureSurvivorsForStatement(statement, new Set([ 'a' ]));

        assert.strictEqual(survivors.length, 1);
        assert.strictEqual(survivors[0]?.node, firstDeclarator);
    });

    test('captureSurvivorsForStatement keeps an unclassified expression statement unconditionally', function () {
        const sourceFile = withSource('console.log("hi");');
        const statement = firstStatement(sourceFile);

        const survivors = captureSurvivorsForStatement(statement, new Set());

        assert.strictEqual(survivors.length, 1);
        assert.strictEqual(survivors[0]?.node, statement);
    });
});

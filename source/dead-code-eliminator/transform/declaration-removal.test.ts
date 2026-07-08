import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { firstStatement, withSource } from '../../test-libraries/transform-test-support.ts';
import { processStatement } from './declaration-removal.ts';

suite('declaration-removal', function () {
    test('processStatement removes a named declaration when its name is not in the surviving set', function () {
        const sourceFile = withSource('function keep() {}\nfunction drop() {}');

        const dropStatement = sourceFile.getFunctionOrThrow('drop');
        const mutated = processStatement(dropStatement, new Set([ 'keep' ]));

        assert.strictEqual(mutated, true);
        assert.strictEqual(sourceFile.getFunction('drop'), undefined);
    });

    test('processStatement leaves a named declaration in place when it is in the surviving set', function () {
        const sourceFile = withSource('function keep() {}');

        const mutated = processStatement(sourceFile.getFunctionOrThrow('keep'), new Set([ 'keep' ]));

        assert.strictEqual(mutated, false);
        assertDefined(sourceFile.getFunction('keep'));
    });

    test('processStatement drops only the non-surviving declarators inside a variable statement', function () {
        const sourceFile = withSource('const a = 1, b = 2;');
        const statement = firstStatement(sourceFile);

        const mutated = processStatement(statement, new Set([ 'a' ]));

        assert.strictEqual(mutated, true);
        assert.strictEqual(sourceFile.getFullText(), 'const a = 1;');
    });

    test('processStatement returns false for an expression statement that is neither named nor a variable declaration', function () {
        const sourceFile = withSource('console.log("hi");');
        const statement = firstStatement(sourceFile);

        assert.strictEqual(processStatement(statement, new Set()), false);
    });
});

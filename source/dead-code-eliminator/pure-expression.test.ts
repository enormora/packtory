import assert from 'node:assert';
import { test } from 'mocha';
import { SyntaxKind, type Expression } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { isPureExpression } from './pure-expression.ts';

function firstInitializer(content: string): Expression {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    const sourceFile = project.getSourceFileOrThrow('index.ts');
    for (const statement of sourceFile.getChildrenOfKind(SyntaxKind.VariableStatement)) {
        const initializer = statement.getDeclarations()[0]?.getInitializer();
        if (initializer !== undefined) {
            return initializer;
        }
    }
    throw new Error('no variable initializer found in test source');
}

test('isPureExpression returns true for a primitive literal', () => {
    assert.strictEqual(isPureExpression(firstInitializer('const a = 1;'), undefined), true);
});

test('isPureExpression returns true for a function expression', () => {
    assert.strictEqual(isPureExpression(firstInitializer('const a = function () {};'), undefined), true);
});

test('isPureExpression returns true for an array literal of pure elements', () => {
    assert.strictEqual(isPureExpression(firstInitializer('const a = [1, "x", true];'), undefined), true);
});

test('isPureExpression returns false for an array literal containing a non-pure call', () => {
    assert.strictEqual(isPureExpression(firstInitializer('const a = [Math.random()];'), undefined), false);
});

test('isPureExpression returns true for an object literal of pure assignments', () => {
    assert.strictEqual(
        isPureExpression(firstInitializer('const a = { x: 1, get y() { return 2; } };'), undefined),
        true
    );
});

test('isPureExpression returns true for a strict-equality binary expression of pure operands', () => {
    assert.strictEqual(isPureExpression(firstInitializer('const a = 1 === 2;'), undefined), true);
});

test('isPureExpression returns false for a binary expression with a disallowed operator', () => {
    assert.strictEqual(isPureExpression(firstInitializer('const a = 1 == 2;'), undefined), false);
});

test('isPureExpression returns false for a call expression to an unknown function', () => {
    assert.strictEqual(
        isPureExpression(firstInitializer('declare const f: () => number;\nconst a = f();'), undefined),
        false
    );
});

test('isPureExpression returns true for a call to a function imported from a trusted pureImports entry', () => {
    const settings: DeadCodeEliminationSettings = { enabled: true, pureImports: [{ from: 'lib' }] };
    const expression = firstInitializer('import { x } from "lib";\nconst a = x();');

    assert.strictEqual(isPureExpression(expression, settings), true);
});

test('isPureExpression returns true for a new expression of a trusted pureConstructor name', () => {
    const settings: DeadCodeEliminationSettings = { enabled: true, pureConstructors: ['Foo'] };
    const expression = firstInitializer('declare class Foo {}\nconst a = new Foo();');

    assert.strictEqual(isPureExpression(expression, settings), true);
});

test('isPureExpression returns false for a new expression whose constructor name is not on the trusted list', () => {
    const settings: DeadCodeEliminationSettings = { enabled: true, pureConstructors: ['Foo'] };
    const expression = firstInitializer('declare class Bar {}\nconst a = new Bar();');

    assert.strictEqual(isPureExpression(expression, settings), false);
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Expression, Statement } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { booleanValue, factsAfterStatement, type BooleanFacts } from './boolean-facts.ts';

function initializerExpression(content: string): Expression {
    return createProject({ withFiles: [ { filePath: 'index.ts', content } ] })
        .getSourceFileOrThrow('index.ts')
        .getVariableDeclarationOrThrow('value')
        .getInitializerOrThrow();
}

function firstStatement(content: string): Statement {
    const statement = createProject({ withFiles: [ { filePath: 'index.ts', content } ] })
        .getSourceFileOrThrow('index.ts')
        .getStatements()[0];
    if (statement === undefined) {
        throw new Error('no statement found in test source');
    }
    return statement;
}

function assertBooleanValue(
    content: string,
    facts: BooleanFacts,
    expected: boolean | undefined
): void {
    assert.strictEqual(booleanValue(initializerExpression(content), facts), expected);
}

suite('boolean facts', function () {
    test('booleanValue evaluates literal and identifier facts', function () {
        assertBooleanValue('const value = true;', new Map(), true);
        assertBooleanValue('const value = false;', new Map(), false);
        assertBooleanValue('const value = enabled;', new Map([ [ 'enabled', true ] ]), true);
        assertBooleanValue('const value = enabled;', new Map(), undefined);
    });

    test('booleanValue evaluates boolean operators', function () {
        assertBooleanValue('const value = true && true;', new Map(), true);
        assertBooleanValue('const value = true && false;', new Map(), false);
        assertBooleanValue('const value = false || true;', new Map(), true);
        assertBooleanValue('const value = false || false;', new Map(), false);
        assertBooleanValue('const value = true === true;', new Map(), true);
        assertBooleanValue('const value = true === false;', new Map(), false);
        assertBooleanValue('const value = true !== false;', new Map(), true);
        assertBooleanValue('const value = true !== true;', new Map(), false);
    });

    test('booleanValue evaluates negation and rejects other unary expressions', function () {
        assertBooleanValue('const value = !false;', new Map(), true);
        assertBooleanValue('const value = !true;', new Map(), false);
        assertBooleanValue('const value = +true;', new Map(), undefined);
    });

    test('booleanValue returns undefined for unknown binary operands and operators', function () {
        assertBooleanValue('declare const maybe: boolean;\nconst value = maybe && true;', new Map(), undefined);
        assertBooleanValue('declare const maybe: boolean;\nconst value = true && maybe;', new Map(), undefined);
        assertBooleanValue('declare const maybe: boolean;\nconst value = maybe || false;', new Map(), undefined);
        assertBooleanValue('declare const maybe: boolean;\nconst value = false || maybe;', new Map(), undefined);
        assertBooleanValue('declare const maybe: boolean;\nconst value = true === maybe;', new Map(), undefined);
        assertBooleanValue('const value = true == true;', new Map(), undefined);
    });

    test('booleanValue returns undefined for negated unknown operands', function () {
        assertBooleanValue('declare const maybe: boolean;\nconst value = !maybe;', new Map(), undefined);
    });

    test('factsAfterStatement records const boolean facts in declaration order', function () {
        const facts = factsAfterStatement(
            firstStatement('const first = true, second = !first, third = second || first;'),
            new Map()
        );

        assert.deepStrictEqual(
            facts,
            new Map([
                [ 'first', true ],
                [ 'second', false ],
                [ 'third', true ]
            ])
        );
    });

    test('factsAfterStatement ignores non-const, non-identifier, and unknown declarations', function () {
        const initialFacts = new Map([ [ 'known', true ] ]);
        const afterLet = factsAfterStatement(firstStatement('let value = false;'), initialFacts);
        const afterDestructure = factsAfterStatement(firstStatement('const { value } = source;'), initialFacts);
        const afterUnknown = factsAfterStatement(firstStatement('const value = source;'), initialFacts);

        assert.deepStrictEqual(afterLet, initialFacts);
        assert.deepStrictEqual(afterDestructure, initialFacts);
        assert.deepStrictEqual(afterUnknown, initialFacts);
    });
});

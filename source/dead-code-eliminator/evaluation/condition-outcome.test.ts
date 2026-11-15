import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { variableInitializer } from '../pure-expression-test-support.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { conditionOutcome, isShortCircuitOperator, selectsLeft } from './condition-outcome.ts';

suite('condition outcome proofs', function () {
    for (
        const [ content, truthy, nullish ] of [
            [ '42', true, false ],
            [ '0', false, false ],
            [ 'null', false, true ],
            [ 'undefined', false, true ],
            [ 'missing', undefined, undefined ],
            [ 'void missing()', false, true ],
            [ '!missing()', undefined, false ],
            [ '!!void missing()', false, false ],
            [ '(missing(),true)', true, false ],
            [ '(missing(),false)', false, false ],
            [ 'missing()&&false', false, undefined ],
            [ 'missing()&&true', undefined, undefined ],
            [ 'missing()||true', true, false ],
            [ 'missing()||false', undefined, undefined ],
            [ 'missing()??true', undefined, undefined ],
            [ 'missing()+false', undefined, undefined ],
            [ '(missing(),true)+unknown()', undefined, undefined ],
            [ 'true&&missing()', undefined, undefined ],
            [ 'false&&missing()', false, false ],
            [ '(missing(),false)&&unknown()', false, false ],
            [ '(missing(),true)&&true', true, false ],
            [ '(missing(),false)||false', false, false ],
            [ '(missing(),null)??null', false, true ],
            [ 'true||missing()', true, false ],
            [ 'false||missing()', undefined, undefined ],
            [ 'null??missing()', undefined, undefined ],
            [ 'false??missing()', false, false ],
            [ '({effect:missing()})', true, false ],
            [ '[missing()]', true, false ],
            [ '(function(){missing();})', true, false ],
            [ '(()=>missing())', true, false ],
            [ '(class{static{missing();}})', true, false ],
            [ '(@decorate class{})', undefined, undefined ],
            [ 'typeof missing', true, false ],
            [ '+missing()', undefined, undefined ],
            [ 'new missing()', undefined, undefined ]
        ] as const
    ) {
        test(`proves outcomes independently of effects in ${content}`, function () {
            const expression = variableInitializer(`const result=${content};export{};`, 'result');
            const evaluation = createSourceEvaluation(expression.getSourceFile());
            assert.deepStrictEqual(conditionOutcome(expression, evaluation, 0), { truthy, nullish });
        });
    }

    for (
        const [ operator, truthy, nullish, expected ] of [
            [ SyntaxKind.QuestionQuestionToken, false, undefined, undefined ],
            [ SyntaxKind.QuestionQuestionToken, undefined, false, true ],
            [ SyntaxKind.QuestionQuestionToken, false, true, false ],
            [ SyntaxKind.AmpersandAmpersandToken, undefined, false, undefined ],
            [ SyntaxKind.BarBarToken, false, false, false ]
        ] as const
    ) {
        const name = `selects ${SyntaxKind[operator]} with truth ${String(truthy)} and null check ${String(nullish)}`;
        test(name, function () {
            assert.strictEqual(selectsLeft(operator, { truthy, nullish }), expected);
        });
    }

    test('rejects unrelated binary operators', function () {
        assert.strictEqual(isShortCircuitOperator(SyntaxKind.PlusToken), false);
    });

    test('consumes depth while following an outcome dependency', function () {
        const expression = variableInitializer('const result=!void missing();', 'result');
        assert.deepStrictEqual(conditionOutcome(expression, createSourceEvaluation(expression.getSourceFile()), 31), {
            truthy: undefined,
            nullish: false
        });
    });

    for (const [ depth, truthy, nullish ] of [ [ 31, false, true ], [ 32, undefined, undefined ] ] as const) {
        test(`bounds outcome evaluation at depth ${String(depth)}`, function () {
            const expression = variableInitializer('const result=void missing();', 'result');
            assert.deepStrictEqual(
                conditionOutcome(expression, createSourceEvaluation(expression.getSourceFile()), depth),
                {
                    truthy,
                    nullish
                }
            );
        });
    }
});

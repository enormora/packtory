import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createExpressionPurityChecker } from './expression-purity.ts';

function observedIsPure(content: string): boolean {
    const source = createProject().createSourceFile('input.ts', content);
    const observed = source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find(function (declaration) {
        return declaration.getName() === 'observed';
    });
    assertDefined(observed);
    return createExpressionPurityChecker()(observed.getInitializerOrThrow());
}

suite('expression purity', function () {
    suite('initializers in either traversal order', function () {
        for (const reversed of [ false, true ]) {
            for (
                const [ content, expected ] of [
                    [ 'const first={};const second=first;const third={...second};', [ true, true, true ] ],
                    [
                        'const object={};const before={...object};object.value=1;const after={...object};',
                        [ true, false, false ]
                    ],
                    [ 'const first=second;const second=first;', [ false, true ] ],
                    [ 'const value=effect();const nested={value};', [ false, true ] ],
                    [ 'const plain=class{};const observable=class{static{effect();}};', [ true, false ] ]
                ] as const
            ) {
                test(`classifies ${content} with reversed traversal ${String(reversed)}`, function () {
                    const source = createProject().createSourceFile('input.ts', content);
                    const expressions = source.getVariableDeclarations().map(function (declaration, index) {
                        return { expression: declaration.getInitializerOrThrow(), expected: expected[index] };
                    });
                    const check = createExpressionPurityChecker();
                    const ordered = reversed ? expressions.toReversed() : expressions;
                    for (const { expression, expected: result } of ordered) {
                        assert.strictEqual(check(expression), result);
                    }
                });
            }
        }
    });

    suite('binding reads', function () {
        for (
            const [ content, expected ] of [
                [ 'for(const value of [1]){const observed=value;}', true ],
                [ 'for(let value=0;value<1;value++){const observed=value;}', true ],
                [ 'try{throw 1;}catch(value){const observed=value;}', true ],
                [ 'namespace value{export const used=1;}const observed=value;', false ],
                [ 'const value=()=>1;value.member=2;const observed=value;', true ],
                [ 'const observed=value;class value{}', false ],
                [ 'namespace value{}const observed=value;', false ],
                [ 'const observed=undefined;const undefined=42;', false ],
                [ 'const value;const observed=value;', false ]
            ] as const
        ) {
            test(`classifies the read in ${content}`, function () {
                assert.strictEqual(observedIsPure(content), expected);
            });
        }
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, ts } from 'ts-morph';
import { variableInitializer } from '../pure-expression-test-support.ts';
import { observeModuleExpression } from '../../test-libraries/run-node-probe.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { evaluateLocalCall } from './local-call.ts';
import { createPureCallResolver } from './pure-local-call.ts';
import type { PrimitiveValue } from './primitive-value.ts';

suite('bounded local evaluation values', function () {
    suite('typed call parameters', function () {
        const typedCalls: readonly (readonly [string, number])[] = [
            [ 'function compute(this: unknown,n:number){return n;}export const value=compute(1);', 1 ],
            [
                'function compute(this: unknown,left:number,right:number){return left*10+right;}' +
                'export const value=compute(2,3);',
                23
            ],
            [ 'function compute(this: unknown,n:number){n++;return n;}export const value=compute(1);', 2 ],
            [ 'function compute(this: unknown){return 42;}export const value=compute();', 42 ],
            [
                'function compute(this: unknown,n:number){return n;function nested(){return 7;}}' +
                'export const value=compute(3);',
                3
            ],
            [ 'export const value=(function(this: unknown,n:number){return n;})(7);', 7 ],
            [
                'function compute(this: unknown,n:number):number{return n<2?n:compute(n-1)+compute(n-2);}' +
                'export const value=compute(30);',
                832_040
            ]
        ];

        for (const [ content, expected ] of typedCalls) {
            test(`matches erased parameter behavior for ${content}`, async function () {
                const runtime = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.ESNext } });
                const native = await observeModuleExpression(runtime.outputText, 'module.value');
                assert.deepStrictEqual(native, { value: expected });
                const call = variableInitializer(content, 'value').asKindOrThrow(SyntaxKind.CallExpression);
                assert.deepStrictEqual(evaluateLocalCall(call), { value: expected });
            });
        }

        test('resolves the runtime argument of a typed identity function', function () {
            const call = variableInitializer(
                'function identity(this: unknown,value:unknown){return value;}const result=identity(input);',
                'result'
            )
                .asKindOrThrow(SyntaxKind.CallExpression);
            assert.strictEqual(
                createPureCallResolver(call.getSourceFile())(call)?.returnedArgument,
                call.getArguments()[0]
            );
        });

        test('leaves actual receiver reads unknown with an erased parameter', function () {
            const call = variableInitializer(
                'function compute(this: unknown,n:number){return this;}const value=compute(1);',
                'value'
            )
                .asKindOrThrow(SyntaxKind.CallExpression);
            assert.strictEqual(evaluateLocalCall(call), undefined);
        });

        test('leaves a typed declaration without a runtime implementation unknown', async function () {
            const content = 'declare function compute(n:number):number;export const value=compute(1);';
            const runtime = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.ESNext } });
            assert.deepStrictEqual(await observeModuleExpression(runtime.outputText, 'module.value'), {
                error: 'ReferenceError'
            });
            const call = variableInitializer(content, 'value').asKindOrThrow(SyntaxKind.CallExpression);
            assert.strictEqual(evaluateLocalCall(call), undefined);
        });
    });

    suite('pure return argument resolution', function () {
        const declarations = [
            'function compute(){return 1;}',
            'function compute(value){}',
            'function compute(value){return 42;}',
            'function compute(value){return {value};}'
        ];
        for (const declaration of declarations) {
            test(`preserves the return value of ${declaration}`, function () {
                const call = variableInitializer(`${declaration}const result=compute(input);`, 'result')
                    .asKindOrThrow(SyntaxKind.CallExpression);
                const resolved = createPureCallResolver(call.getSourceFile())(call);
                assertDefined(resolved);
                assert.strictEqual(resolved.returnedArgument, undefined);
            });
        }

        test('retains iteration when spread and ordinary arguments are mixed', function () {
            const call = variableInitializer(
                'function compute(value){return value;}const result=compute(input,...values);',
                'result'
            )
                .asKindOrThrow(SyntaxKind.CallExpression);
            assert.strictEqual(createPureCallResolver(call.getSourceFile())(call), undefined);
        });
    });
    const expressions: readonly (readonly [string, PrimitiveValue])[] = [
        [ '5e-324', Number.MIN_VALUE ],
        [ '-5e-324', -Number.MIN_VALUE ],
        [ '1e-7', 0.0000001 ],
        [ '1e21', 1_000_000_000_000_000_000_000 ],
        [ '1E3', 1000 ],
        [ '2e+2', 200 ],
        [ '1.5e10', 15_000_000_000 ],
        [ '1e309', Number.POSITIVE_INFINITY ],
        [ '1e-999', 0 ],
        [ '-1e-999', -0 ],
        [ '1_000', 1000 ],
        [ '0xFF_FF', 65_535 ],
        [ '0b10_10', 10 ],
        [ '0o7_7', 63 ],
        [ '.5e2', 50 ],
        [ '7 + 3', 10 ],
        [ '7 - 3', 4 ],
        [ '7 * 3', 21 ],
        [ '7 / 2', 3.5 ],
        [ '7 % 3', 1 ],
        [ '7 < 3', false ],
        [ '3 < 7', true ],
        [ '3 <= 3', true ],
        [ '7 <= 3', false ],
        [ '7 > 3', true ],
        [ '3 > 7', false ],
        [ '3 >= 3', true ],
        [ '3 >= 7', false ],
        [ '3 === 3', true ],
        [ '3 === "3"', false ],
        [ '3 !== 3', false ],
        [ '3 !== "3"', true ],
        [ '"hello" + "world"', 'helloworld' ],
        [ '`hello`', 'hello' ],
        [ '-3', -3 ],
        [ '+3', 3 ],
        [ '!0', true ],
        [ '!1', false ],
        [ '0 && missing()', 0 ],
        [ '1 || missing()', 1 ],
        [ '1 && 7', 7 ],
        [ '0 || 7', 7 ],
        [ 'null ?? 7', 7 ],
        [ '0 ?? missing()', 0 ],
        [ 'null', null ],
        [ '0 / 0', Number.NaN ],
        [ '1 / 0', Number.POSITIVE_INFINITY ],
        [ '-0', -0 ]
    ];

    for (const [ expression, expected ] of expressions) {
        test(`evaluates ${expression}`, function () {
            const call = variableInitializer(`const unused = (() => ${expression})();`, 'unused');
            assert.deepStrictEqual(evaluateLocalCall(call.asKindOrThrow(SyntaxKind.CallExpression)), {
                value: expected
            });
        });
    }

    const bodies: readonly (readonly [string, PrimitiveValue])[] = [
        [ 'let n = 1; return n++;', 1 ],
        [ 'let n = 1; return ++n;', 2 ],
        [ 'let n = 1; return n--;', 1 ],
        [ 'let n = 1; return --n;', 0 ],
        [ 'let n = 1; n = 3; return n;', 3 ],
        [ 'let n = 1; n += 3; return n;', 4 ],
        [ 'let n; return n;', undefined ],
        [ 'return;', undefined ],
        [ '', undefined ],
        [ 'let n = 1; { let n = 2; n++; } return n;', 1 ],
        [ 'let n = 1; { n = 2; } return n;', 2 ],
        [ 'for (let i = 0; i < 5; i++) { if (i === 3) return i; } return 0;', 3 ],
        [ 'if (0 / 0) return 1; else return 2;', 2 ],
        [ 'if ("") return 1; else return 2;', 2 ],
        [ 'if ("value") return 1; return 2;', 1 ]
    ];

    for (const [ body, expected ] of bodies) {
        test(`evaluates ${body}`, function () {
            const call = variableInitializer(`const unused = (() => { ${body} })();`, 'unused');
            assert.deepStrictEqual(evaluateLocalCall(call.asKindOrThrow(SyntaxKind.CallExpression)), {
                value: expected
            });
        });
    }
});

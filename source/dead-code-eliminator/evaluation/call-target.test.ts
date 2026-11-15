import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createCallTargetResolver, parameterBindingIsStable } from './call-target.ts';
import { evaluateLocalCall } from './local-call.ts';

suite('conditional function bindings', function () {
    suite('parameter bindings', function () {
        test('keeps nested function parameters in their own binding scope', function () {
            const source = createProject().createSourceFile(
                'input.cjs',
                'function compute(value){return value;function nested(value){}}compute(42);'
            );
            assert.deepStrictEqual(
                evaluateLocalCall(source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)),
                { value: 42 }
            );
        });

        test('does not propagate values through duplicate parameter bindings', function () {
            const source = createProject().createSourceFile(
                'input.cjs',
                'function compute(value,value){return value;}compute(1,42);'
            );
            const parameters = source.getFunctionOrThrow('compute').getParameters();
            for (const parameter of parameters) {
                assert.strictEqual(parameterBindingIsStable(parameter), false);
            }
            assert.strictEqual(
                evaluateLocalCall(source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)),
                undefined
            );
        });

        test('retains a parameter replaced by a hoisted function declaration', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'function compute(value){function value(){}return value;}'
            );
            const parameter = source.getFirstDescendantByKindOrThrow(SyntaxKind.Parameter);
            assert.strictEqual(parameterBindingIsStable(parameter), false);
        });
    });
    for (
        const content of [
            'function selected(){return 1;}if(flag){function unrelated(){return 2;}}selected();',
            'function outer(){function selected(){return 1;}return selected();}'
        ]
    ) {
        test(`keeps stable declarations distinct from conditional replacements in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            const target = source.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).find(function (declaration) {
                return declaration.getName() === 'selected';
            });
            assertDefined(target);
            const resolve = createCallTargetResolver(source, function () {
                return true;
            });
            assert.strictEqual(resolve(call), target);
        });
    }

    test('does not treat namespace method calls as local identifier calls', function () {
        const source = createProject().createSourceFile(
            'input.ts',
            'namespace Scope{export function selected(){return 1;}Scope.selected();}'
        );
        const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
        const resolve = createCallTargetResolver(source, function () {
            return true;
        });
        assert.strictEqual(resolve(call), undefined);
    });

    for (const accepted of [ true, false ]) {
        test(`reuses function support proofs when acceptance is ${String(accepted)}`, function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'function compute(){return 42;}const value=compute();export{};'
            );
            const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            let checks = 0;
            const resolve = createCallTargetResolver(source, function () {
                checks += 1;
                return accepted;
            });
            assert.strictEqual(resolve(call), accepted ? source.getFunctionOrThrow('compute') : undefined);
            assert.strictEqual(resolve(call), accepted ? source.getFunctionOrThrow('compute') : undefined);
            assert.strictEqual(checks, 1);
        });
    }

    for (
        const [ name, prefix, suffix, stable ] of [
            [ 'module scope', '', 'export const value=compute();', true ],
            [ 'double quoted strict directive', '"use strict";', 'compute();', true ],
            [ 'single quoted strict directive', "'use strict';", 'compute();', true ],
            [ 'strict directive after another directive', '"use custom";"use strict";', 'compute();', true ],
            [ 'custom directive', '"use custom";', 'compute();', false ],
            [ 'non-string statement ends directives', '"use custom";0;"use strict";', 'compute();', false ],
            [ 'empty statement ends directives', ';"use strict";', 'compute();', false ]
        ] as const
    ) {
        test(name, function () {
            const source = createProject().createSourceFile(
                'input.js',
                `${prefix}function compute(){return 1;}if(true){function compute(){return 2;}}${suffix}`
            );
            const resolver = createCallTargetResolver(source, function () {
                return true;
            });
            const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            assert.strictEqual(resolver(call), stable ? source.getFunctionOrThrow('compute') : undefined);
        });
    }

    for (
        const content of [
            'declare function compute():number;compute();',
            'function compute(value){return value;}compute(...[]);',
            'function compute(value){return value;}compute(,);'
        ]
    ) {
        test(`retains unsupported call ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            assert.strictEqual(
                evaluateLocalCall(source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)),
                undefined
            );
        });
    }
});

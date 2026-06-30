import assert from 'node:assert';
import { suite, test } from 'mocha';
import { firstVariableInitializerExpression } from '../test-libraries/first-variable-initializer-expression.ts';
import { resolveImportedExpressionOrigin } from './imported-expression-origin.ts';

function pureRecurseStub(): boolean {
    return true;
}

function impureRecurseStub(): boolean {
    return false;
}

suite('imported-expression-origin', function () {
    suite('import origin resolution', function () {
        test('resolveImportedExpressionOrigin returns undefined for a literal identifier with no import binding', function () {
            const expression = firstVariableInitializerExpression('const x = 1;\nconst a = x;');

            assert.strictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), undefined);
        });

        test('resolveImportedExpressionOrigin returns undefined for an identifier with a non-import declaration', function () {
            const expression = firstVariableInitializerExpression('const local = 1;\nconst a = local;');

            assert.strictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), undefined);
        });

        test('resolveImportedExpressionOrigin resolves an identifier originating from a named import', function () {
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x;');

            assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
                from: 'lib',
                path: [ 'x' ]
            });
        });

        test('resolveImportedExpressionOrigin skips earlier merged declarations that are not imports', function () {
            const expression = firstVariableInitializerExpression(
                'interface Foo {}\nimport { Foo } from "lib";\nconst a = Foo;'
            );

            assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
                from: 'lib',
                path: [ 'Foo' ]
            });
        });

        test('resolveImportedExpressionOrigin resolves a namespace import access to an empty path', function () {
            const expression = firstVariableInitializerExpression('import * as ns from "lib";\nconst a = ns;');

            assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
                from: 'lib',
                path: []
            });
        });

        test('resolveImportedExpressionOrigin resolves a default import to the "default" path entry', function () {
            const expression = firstVariableInitializerExpression('import x from "lib";\nconst a = x;');

            assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
                from: 'lib',
                path: [ 'default' ]
            });
        });

        test('resolveImportedExpressionOrigin appends property accesses onto the base import path', function () {
            const expression = firstVariableInitializerExpression('import * as ns from "lib";\nconst a = ns.foo.bar;');

            assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
                from: 'lib',
                path: [ 'foo', 'bar' ]
            });
        });

        test('resolveImportedExpressionOrigin returns undefined for a call whose callee is not from a trusted import', function () {
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x();');

            assert.strictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), undefined);
        });
    });

    suite('trusted call origin resolution', function () {
        test('resolveImportedExpressionOrigin returns the callee origin for a call whose callee is from a trusted import', function () {
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x();');

            assert.deepStrictEqual(
                resolveImportedExpressionOrigin(expression, pureRecurseStub, {
                    enabled: true,
                    pureImports: [ { from: 'lib' } ]
                }),
                { from: 'lib', path: [ 'x' ] }
            );
        });

        test('resolveImportedExpressionOrigin returns the callee origin for a trusted import call with pure arguments', function () {
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x(1);');

            assert.deepStrictEqual(
                resolveImportedExpressionOrigin(expression, pureRecurseStub, {
                    enabled: true,
                    pureImports: [ { from: 'lib' } ]
                }),
                { from: 'lib', path: [ 'x' ] }
            );
        });

        test('resolveImportedExpressionOrigin matches a trusted import against the imported path head', function () {
            const expression = firstVariableInitializerExpression(
                'import * as ns from "lib";\nconst a = ns.foo.bar();'
            );

            assert.deepStrictEqual(
                resolveImportedExpressionOrigin(expression, pureRecurseStub, {
                    enabled: true,
                    pureImports: [ { from: 'lib', imports: [ 'foo' ] } ]
                }),
                { from: 'lib', path: [ 'foo', 'bar' ] }
            );
        });

        test('resolveImportedExpressionOrigin does not match a trusted import when the imported path head differs', function () {
            const expression = firstVariableInitializerExpression(
                'import * as ns from "lib";\nconst a = ns.foo.bar();'
            );

            assert.strictEqual(
                resolveImportedExpressionOrigin(expression, pureRecurseStub, {
                    enabled: true,
                    pureImports: [ { from: 'lib', imports: [ 'bar' ] } ]
                }),
                undefined
            );
        });

        test('resolveImportedExpressionOrigin does not match a namespace import without a path head', function () {
            const expression = firstVariableInitializerExpression('import * as ns from "lib";\nconst a = ns();');

            assert.strictEqual(
                resolveImportedExpressionOrigin(expression, pureRecurseStub, {
                    enabled: true,
                    pureImports: [ { from: 'lib', imports: [ 'lib' ] } ]
                }),
                undefined
            );
        });

        test('resolveImportedExpressionOrigin returns undefined for a trusted import call with impure arguments', function () {
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x(1);');

            assert.strictEqual(
                resolveImportedExpressionOrigin(expression, impureRecurseStub, {
                    enabled: true,
                    pureImports: [ { from: 'lib' } ]
                }),
                undefined
            );
        });

        test('resolveImportedExpressionOrigin returns undefined for a trusted import call with an impure spread argument', function () {
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x(...args);');

            assert.strictEqual(
                resolveImportedExpressionOrigin(expression, impureRecurseStub, {
                    enabled: true,
                    pureImports: [ { from: 'lib' } ]
                }),
                undefined
            );
        });
    });
});

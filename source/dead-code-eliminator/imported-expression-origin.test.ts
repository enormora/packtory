import assert from 'node:assert';
import { suite, test } from 'mocha';
import { firstVariableInitializerExpression } from '../test-libraries/first-variable-initializer-expression.ts';
import {
    originIsTrustedPureImport,
    resolveImportedExpressionPath,
    resolveImportedExpressionPropertyPath,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';

suite('imported-expression-origin', function () {
    suite('import path resolution', function () {
        test('resolveImportedExpressionPath returns undefined for a literal identifier with no import binding', function () {
            const expression = firstVariableInitializerExpression('const x = 1;\nconst a = x;');

            assert.strictEqual(resolveImportedExpressionPath(expression), undefined);
        });

        test('resolveImportedExpressionPath returns undefined for an identifier with a non-import declaration', function () {
            const expression = firstVariableInitializerExpression('const local = 1;\nconst a = local;');

            assert.strictEqual(resolveImportedExpressionPath(expression), undefined);
        });

        test('resolveImportedExpressionPath resolves an identifier originating from a named import', function () {
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x;');

            assert.deepStrictEqual(resolveImportedExpressionPath(expression), { from: 'lib', path: [ 'x' ] });
        });

        test('resolveImportedExpressionPath skips earlier merged declarations that are not imports', function () {
            const expression = firstVariableInitializerExpression(
                'interface Foo {}\nimport { Foo } from "lib";\nconst a = Foo;'
            );

            assert.deepStrictEqual(resolveImportedExpressionPath(expression), { from: 'lib', path: [ 'Foo' ] });
        });

        test('resolveImportedExpressionPath resolves a namespace import to an empty path', function () {
            const expression = firstVariableInitializerExpression('import * as ns from "lib";\nconst a = ns;');

            assert.deepStrictEqual(resolveImportedExpressionPath(expression), { from: 'lib', path: [] });
        });

        test('resolveImportedExpressionPath resolves a default import to the default path entry', function () {
            const expression = firstVariableInitializerExpression('import x from "lib";\nconst a = x;');

            assert.deepStrictEqual(resolveImportedExpressionPath(expression), { from: 'lib', path: [ 'default' ] });
        });

        test('resolveImportedExpressionPath returns undefined for a non-identifier expression', function () {
            const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x();');

            assert.strictEqual(resolveImportedExpressionPath(expression), undefined);
        });
    });

    suite('import property path resolution', function () {
        test('resolveImportedExpressionPropertyPath appends property accesses onto the base import path', function () {
            const expression = firstVariableInitializerExpression('import * as ns from "lib";\nconst a = ns.foo.bar;');

            assert.deepStrictEqual(
                resolveImportedExpressionPropertyPath(expression),
                { from: 'lib', path: [ 'foo', 'bar' ] }
            );
        });

        test('resolveImportedExpressionPropertyPath returns undefined for element access', function () {
            const expression = firstVariableInitializerExpression('import * as ns from "lib";\nconst a = ns["foo"];');

            assert.strictEqual(resolveImportedExpressionPropertyPath(expression), undefined);
        });
    });

    suite('trusted import matching', function () {
        const origin: ImportedExpressionOrigin = { from: 'lib', path: [ 'foo', 'bar' ] };

        test('originIsTrustedPureImport matches a module-wide trusted import', function () {
            assert.strictEqual(
                originIsTrustedPureImport(origin, { enabled: true, pureImports: [ { from: 'lib' } ] }),
                true
            );
        });

        test('originIsTrustedPureImport matches the imported path head', function () {
            assert.strictEqual(
                originIsTrustedPureImport(origin, {
                    enabled: true,
                    pureImports: [ { from: 'lib', imports: [ 'foo' ] } ]
                }),
                true
            );
        });

        test('originIsTrustedPureImport rejects a different path head', function () {
            assert.strictEqual(
                originIsTrustedPureImport(origin, {
                    enabled: true,
                    pureImports: [ { from: 'lib', imports: [ 'bar' ] } ]
                }),
                false
            );
        });

        test('originIsTrustedPureImport rejects a namespace import without a path head', function () {
            assert.strictEqual(
                originIsTrustedPureImport(
                    { from: 'lib', path: [] },
                    { enabled: true, pureImports: [ { from: 'lib', imports: [ 'lib' ] } ] }
                ),
                false
            );
        });

        test('originIsTrustedPureImport rejects a missing origin', function () {
            assert.strictEqual(
                originIsTrustedPureImport(undefined, { enabled: true, pureImports: [ { from: 'lib' } ] }),
                false
            );
        });
    });
});

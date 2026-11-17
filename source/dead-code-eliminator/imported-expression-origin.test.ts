import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { firstVariableInitializerExpression } from '../test-libraries/first-variable-initializer-expression.ts';
import {
    arePureCallArguments,
    originIsTrustedPureImport,
    resolveImportedExpressionPath,
    resolveImportedExpressionPropertyPath,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';

suite('imported-expression-origin', function () {
    suite('import path resolution', function () {
        for (
            const content of [
                'import { external as local } from "lib";const result=local;',
                'import { external as \\u006c\\u006f\\u0063\\u0061\\u006c } from "lib";const result=local;',
                'import { external as local } from "lib";const result=\\u006c\\u006f\\u0063\\u0061\\u006c;'
            ]
        ) {
            test(`resolves the local import name in ${content}`, function () {
                assert.deepStrictEqual(resolveImportedExpressionPath(firstVariableInitializerExpression(content)), {
                    from: 'lib',
                    path: [ 'external' ]
                });
            });
        }

        test('reads changed import bindings after source edits', function () {
            const expression = firstVariableInitializerExpression('import value from "lib";const result=value;');
            const source = expression.getSourceFile();
            assert.deepStrictEqual(resolveImportedExpressionPath(expression), { from: 'lib', path: [ 'default' ] });
            source.replaceWithText('const result=value;');
            assert.strictEqual(
                resolveImportedExpressionPath(
                    source.getVariableDeclarationOrThrow('result').getInitializerOrThrow()
                ),
                undefined
            );
            source.replaceWithText('import other from "another";const result=other;');
            assert.deepStrictEqual(
                resolveImportedExpressionPath(
                    source.getVariableDeclarationOrThrow('result').getInitializerOrThrow()
                ),
                { from: 'another', path: [ 'default' ] }
            );
        });

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

    test('rejects spread arguments before checking expression purity', function () {
        const call = firstVariableInitializerExpression('const value = run(...items);')
            .asKindOrThrow(SyntaxKind.CallExpression);
        let visited = 0;
        assert.strictEqual(
            arePureCallArguments(call.getArguments(), function () {
                visited += 1;
                return true;
            }),
            false
        );
        assert.strictEqual(visited, 0);
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

        for (
            const [ path, imports, expected ] of [
                [ [ 'foo' ], [ 'other', 'foo' ], true ],
                [ [ 'foo' ], [], false ],
                [ [ 'lib' ], [ 'lib' ], false ],
                [ [ { type: 'call-result' } ], [ 'foo' ], false ]
            ] as const
        ) {
            test(`matches trusted names for ${JSON.stringify({ path, imports })}`, function () {
                assert.strictEqual(
                    originIsTrustedPureImport(
                        { from: 'lib', path },
                        { enabled: true, pureImports: [ { from: 'lib', imports } ] }
                    ),
                    expected
                );
            });
        }

        test('originIsTrustedPureImport rejects a missing origin', function () {
            assert.strictEqual(
                originIsTrustedPureImport(undefined, { enabled: true, pureImports: [ { from: 'lib' } ] }),
                false
            );
        });
    });
});

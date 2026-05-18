import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type Expression } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { resolveImportedExpressionOrigin } from './imported-expression-origin.ts';

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

function pureRecurseStub(): boolean {
    return true;
}

suite('imported-expression-origin', function () {
    test('resolveImportedExpressionOrigin returns undefined for a literal identifier with no import binding', function () {
        const expression = firstInitializer('const x = 1;\nconst a = x;');

        assert.strictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), undefined);
    });

    test('resolveImportedExpressionOrigin resolves an identifier originating from a named import', function () {
        const expression = firstInitializer('import { x } from "lib";\nconst a = x;');

        assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
            from: 'lib',
            path: ['x']
        });
    });

    test('resolveImportedExpressionOrigin resolves a namespace import access to an empty path', function () {
        const expression = firstInitializer('import * as ns from "lib";\nconst a = ns;');

        assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
            from: 'lib',
            path: []
        });
    });

    test('resolveImportedExpressionOrigin resolves a default import to the "default" path entry', function () {
        const expression = firstInitializer('import x from "lib";\nconst a = x;');

        assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
            from: 'lib',
            path: ['default']
        });
    });

    test('resolveImportedExpressionOrigin appends property accesses onto the base import path', function () {
        const expression = firstInitializer('import * as ns from "lib";\nconst a = ns.foo.bar;');

        assert.deepStrictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), {
            from: 'lib',
            path: ['foo', 'bar']
        });
    });

    test('resolveImportedExpressionOrigin returns undefined for a call whose callee is not from a trusted import', function () {
        const expression = firstInitializer('import { x } from "lib";\nconst a = x();');

        assert.strictEqual(resolveImportedExpressionOrigin(expression, pureRecurseStub, undefined), undefined);
    });

    test('resolveImportedExpressionOrigin returns the callee origin for a call whose callee is from a trusted import', function () {
        const expression = firstInitializer('import { x } from "lib";\nconst a = x();');

        assert.deepStrictEqual(
            resolveImportedExpressionOrigin(expression, pureRecurseStub, {
                enabled: true,
                pureImports: [{ from: 'lib' }]
            }),
            { from: 'lib', path: ['x'] }
        );
    });
});

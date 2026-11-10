import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type ClassDeclaration, type Expression } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from './runtime-module-resolution.ts';
import { createExpressionPurityChecker } from './pure-expression.ts';
import { hasClassImpurity } from './class-purity.ts';
import { resolveComputedPropertyKey } from './computed-property-key-purity.ts';

function classDeclaration(content: string): ClassDeclaration {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    return project.getSourceFileOrThrow('index.ts').getFirstChildByKindOrThrow(SyntaxKind.ClassDeclaration);
}

const isPure = createExpressionPurityChecker(undefined, resolveRuntimeModule);
const propertyKeyFor = function (expression: Expression): string | undefined {
    return resolveComputedPropertyKey(expression, resolveRuntimeModule);
};

suite('class-purity', function () {
    suite('heritage', function () {
        for (
            const heritage of [
                '3',
                'true',
                '"base"',
                'undefined',
                '{}',
                '() => {}',
                'async function () {}',
                'function* () {}',
                'async function* () {}',
                'class extends 3 {}',
                'class { static { throw new Error(); } }'
            ]
        ) {
            test(`hasClassImpurity preserves uncertain or invalid heritage ${heritage}`, function () {
                const declaration = classDeclaration(`class Unused extends (${heritage}) {}`);

                assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), true);
            });
        }

        for (const heritage of [ 'null', '(null as null)', 'function () {}', 'class {}', 'class extends null {}' ]) {
            test(`hasClassImpurity permits proven safe heritage ${heritage}`, function () {
                const declaration = classDeclaration(`class Unused extends (${heritage}) {}`);

                assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), false);
            });
        }
    });

    test('hasClassImpurity returns false for a class with only methods and unannotated members', function () {
        const declaration = classDeclaration('class Foo { method() { return 1; } }');

        assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), false);
    });

    test('hasClassImpurity returns true when the class itself is decorated', function () {
        const declaration = classDeclaration(
            'function dec(_: unknown): void {}\n@dec\nclass Foo { method() { return 1; } }'
        );

        assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), true);
    });

    test('hasClassImpurity returns true when a method member is decorated', function () {
        const declaration = classDeclaration(
            'function dec(_: unknown, __: unknown): void {}\nclass Foo { @dec method() { return 1; } }'
        );

        assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), true);
    });

    test('hasClassImpurity returns true when a static field has an impure initializer', function () {
        const declaration = classDeclaration('class Foo { static items = [].length; }');

        assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), true);
    });

    test('hasClassImpurity returns true when the class extends an impure expression', function () {
        const declaration = classDeclaration('class Foo extends compute() {}');

        assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), true);
    });

    test('hasClassImpurity returns true when a member has an impure computed name', function () {
        const declaration = classDeclaration('class Foo { [compute()]() {} }');

        assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), true);
    });

    test('hasClassImpurity returns false when a static field has a pure literal initializer', function () {
        const declaration = classDeclaration('class Foo { static items = 1; }');

        assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), false);
    });

    test('hasClassImpurity returns true when the class declares a static initialization block', function () {
        const declaration = classDeclaration('class Foo { static { console.log("init"); } }');

        assert.strictEqual(hasClassImpurity(declaration, isPure, propertyKeyFor), true);
    });
});

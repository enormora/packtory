import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type ClassDeclaration } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { hasClassImpurity } from './class-purity.ts';

function classDeclaration(content: string): ClassDeclaration {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    return project.getSourceFileOrThrow('index.ts').getFirstChildByKindOrThrow(SyntaxKind.ClassDeclaration);
}

suite('class-purity', function () {
    test('hasClassImpurity returns false for a class with only methods and unannotated members', function () {
        const declaration = classDeclaration('class Foo { method() { return 1; } }');

        assert.strictEqual(hasClassImpurity(declaration, undefined), false);
    });

    test('hasClassImpurity returns true when the class itself is decorated', function () {
        const declaration = classDeclaration(
            'function dec(_: unknown): void {}\n@dec\nclass Foo { method() { return 1; } }'
        );

        assert.strictEqual(hasClassImpurity(declaration, undefined), true);
    });

    test('hasClassImpurity returns true when a method member is decorated', function () {
        const declaration = classDeclaration(
            'function dec(_: unknown, __: unknown): void {}\nclass Foo { @dec method() { return 1; } }'
        );

        assert.strictEqual(hasClassImpurity(declaration, undefined), true);
    });

    test('hasClassImpurity returns true when a static field has an impure initializer', function () {
        const declaration = classDeclaration('class Foo { static items = [].length; }');

        assert.strictEqual(hasClassImpurity(declaration, undefined), true);
    });

    test('hasClassImpurity returns false when a static field has a pure literal initializer', function () {
        const declaration = classDeclaration('class Foo { static items = 1; }');

        assert.strictEqual(hasClassImpurity(declaration, undefined), false);
    });

    test('hasClassImpurity returns true when the class declares a static initialization block', function () {
        const declaration = classDeclaration('class Foo { static { console.log("init"); } }');

        assert.strictEqual(hasClassImpurity(declaration, undefined), true);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { isNamedDeclaration } from './named-declaration-kinds.ts';

function statementsFor(content: string) {
    const project = createProject({ withFiles: [{ filePath: '/source.ts', content }] });
    return project.getSourceFileOrThrow('/source.ts').getStatements();
}

suite('named-declaration-kinds', function () {
    test('isNamedDeclaration returns true for function, class, interface, type-alias, enum, and module declarations', function () {
        const statements = statementsFor(
            [
                'function f() {}',
                'class C {}',
                'interface I {}',
                'type T = number;',
                'enum E { A }',
                'namespace N {}'
            ].join('\n')
        );

        for (const statement of statements) {
            assert.strictEqual(isNamedDeclaration(statement), true, `expected named for ${statement.getKindName()}`);
        }
    });

    test('isNamedDeclaration returns false for variable statements and side-effecting expressions', function () {
        const [variableStatement, expressionStatement] = statementsFor('const x = 1;\nconsole.log("hi");');

        assert.strictEqual(isNamedDeclaration(variableStatement!), false);
        assert.strictEqual(isNamedDeclaration(expressionStatement!), false);
    });
});

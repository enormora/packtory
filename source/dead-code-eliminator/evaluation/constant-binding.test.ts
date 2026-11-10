import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { constantDominatesRead, constantValueFor } from './constant-binding.ts';
import { evaluated } from './primitive-value.ts';

suite('constant-binding', function () {
    test('does not treat a declaration name or initializer as a subsequent read', function () {
        const source = createProject({ withFiles: [ { filePath: 'index.ts', content: 'const value = value;' } ] })
            .getSourceFileOrThrow('index.ts');
        const declaration = source.getVariableDeclarationOrThrow('value');
        assert.strictEqual(
            constantDominatesRead(declaration, declaration.getNameNode().asKindOrThrow(SyntaxKind.Identifier)),
            false
        );
        assert.strictEqual(constantDominatesRead(declaration, declaration.getInitializerOrThrow()), false);
    });

    test('rejects constants declared directly in switch clauses', function () {
        const source = createProject({
            withFiles: [ {
                filePath: 'index.ts',
                content: 'switch (input) { case 0: const value = 1; consume(value); }'
            } ]
        })
            .getSourceFileOrThrow('index.ts');
        const declaration = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
        const read = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression).getArguments()[0];
        assertDefined(read);
        assert.strictEqual(constantDominatesRead(declaration, read.asKindOrThrow(SyntaxKind.Identifier)), false);
    });

    for (
        const content of [
            'let value = 1; const run = () => value; run();',
            'for (const value of items) { const run = () => value; run(); }'
        ]
    ) {
        test(`rejects a known value without a constant statement: ${content}`, function () {
            const source = createProject({ withFiles: [ { filePath: 'index.ts', content } ] })
                .getSourceFileOrThrow('index.ts');
            const declaration = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
            const read = source
                .getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction)
                .getBody()
                .asKindOrThrow(SyntaxKind.Identifier);
            const root = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            assert.strictEqual(constantValueFor(read, new Map([ [ declaration, evaluated(1) ] ]), root), undefined);
        });
    }

    test('leaves unresolved identifiers unknown', function () {
        const source = createProject({ withFiles: [ { filePath: 'index.ts', content: 'const value = missing;' } ] })
            .getSourceFileOrThrow('index.ts');
        const read = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow().asKindOrThrow(
            SyntaxKind.Identifier
        );
        assert.strictEqual(constantValueFor(read, new Map(), read), undefined);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { constantDominatesRead, constantValueFor, createConstantBindingValues } from './constant-binding.ts';
import { evaluated } from './primitive-value.ts';

suite('constant-binding', function () {
    suite('captured and intrinsic bindings', function () {
        test('uses a module constant when the invocation follows its initialization', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'const value=42;function read(){return value;}const observed=read();export{};'
            );
            const declaration = source.getVariableDeclarationOrThrow('value');
            const read = source
                .getFunctionOrThrow('read')
                .getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement)
                .getExpressionOrThrow()
                .asKindOrThrow(SyntaxKind.Identifier);
            const root = source.getVariableDeclarationOrThrow('observed').getInitializerOrThrow();
            const constantValue = constantValueFor(read, new Map([ [ declaration, evaluated(42) ] ]), root);
            assert.deepStrictEqual(
                constantValue,
                evaluated(42)
            );
        });

        test('uses the local binding when undefined is shadowed', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'const undefined=7;const observed=undefined;export{};'
            );
            const declaration = source.getVariableDeclarationOrThrow('undefined');
            const read = source.getVariableDeclarationOrThrow('observed').getInitializerOrThrow().asKindOrThrow(
                SyntaxKind.Identifier
            );
            const value = constantValueFor(read, new Map([ [ declaration, evaluated(7) ] ]), read);
            assert.deepStrictEqual(
                value,
                evaluated(7)
            );
        });
    });

    test('does not prove a parser placeholder at the end of an incomplete declaration', function () {
        const source = createProject().createSourceFile('incomplete.ts', 'const value=;');
        const declaration = source.getVariableDeclarationOrThrow('value');
        assert.strictEqual(constantDominatesRead(declaration, declaration.getInitializerOrThrow()), false);
    });

    test('keeps an initializing binding unavailable without evaluating later declarations', function () {
        const source = createProject().createSourceFile('input.ts', 'const first=first;const later=1;');
        const declaration = source.getVariableDeclarationOrThrow('first');
        const evaluatedInitializers: string[] = [];
        const bindings = createConstantBindingValues(source.getVariableDeclarations(), function (expression) {
            evaluatedInitializers.push(expression.getText());
            return bindings.get(declaration);
        });
        assert.strictEqual(bindings.get(declaration), undefined);
        assert.deepStrictEqual(evaluatedInitializers, [ 'first' ]);
    });

    test('leaves declarations outside the source unknown', function () {
        const declaration = createProject()
            .createSourceFile('outside.ts', 'const outside=1;')
            .getVariableDeclarationOrThrow('outside');
        const bindings = createConstantBindingValues([], function () {
            return assert.fail('There are no initializers');
        });
        assert.strictEqual(bindings.get(declaration), undefined);
    });

    test('evaluates constant initializers only when a dependency requests them', function () {
        const source = createProject().createSourceFile(
            'constants.ts',
            [
                'const known=1;',
                'const unknown=consume();',
                'const missing;',
                'const {nested}={nested:2};',
                'let mutable=3;',
                'declare const ambient:number;'
            ]
                .join('')
        );
        const evaluatedInitializers: string[] = [];
        const bindings = createConstantBindingValues(source.getVariableDeclarations(), function (expression) {
            evaluatedInitializers.push(expression.getText());
            return expression.getText() === '1' ? evaluated(1) : undefined;
        });
        assert.deepStrictEqual(evaluatedInitializers, []);
        assert.deepStrictEqual(bindings.get(source.getVariableDeclarationOrThrow('known')), evaluated(1));
        assert.deepStrictEqual(evaluatedInitializers, [ '1' ]);
        for (const declaration of source.getVariableDeclarations().slice(1)) {
            assert.strictEqual(bindings.get(declaration), undefined);
        }
        assert.deepStrictEqual(evaluatedInitializers, [ '1', 'consume()' ]);
        assert.deepStrictEqual(
            [ bindings.get(source.getVariableDeclarationOrThrow('unknown')), evaluatedInitializers ],
            [ undefined, [ '1', 'consume()' ] ]
        );
    });

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
            'for (const value of items) { const run = () => value; run(); }',
            'try { unknown(); } catch (value) { const run = () => value; run(); }'
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
            const value = constantValueFor(read, new Map([ [ declaration, evaluated(1) ] ]), root);
            assert.strictEqual(value, undefined);
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

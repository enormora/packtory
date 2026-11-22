import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Node as TypeScriptMorphNode, SyntaxKind, VariableDeclarationKind, type SourceFile } from 'ts-morph';
import { callEffectCases, callEffectProgram } from '../test-libraries/call-effect-cases.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';

async function emittedCallCase(name: string): Promise<SourceFile> {
    const input = callEffectCases.find(function (candidate) {
        return candidate.name === name;
    });
    assertDefined(input);
    const fixture = singleFileOracleCase(callEffectProgram(input), input.targetFilePath);
    const [ result ] = await createTestEliminator().eliminate(fixture.eliminationInputs);
    const content = result?.contents[0]?.fileDescription.content;
    assertDefined(content);
    return createProject().createSourceFile(input.targetFilePath, content);
}

suite('call effects through the DCE pipeline', function () {
    test('retains argument effects in their original order', async function () {
        const source = await emittedCallCase('factory-effects-in-order');
        assert.deepStrictEqual(
            source.getDescendantsOfKind(SyntaxKind.CallExpression).map(function (call) {
                return call.getArguments().map(function (argument) {
                    return argument.getText();
                });
            }),
            [ [ '"first"' ], [ '"second"' ] ]
        );
        assert.strictEqual(source.getFunction('pure'), undefined);
        assert.deepStrictEqual(
            source.getExportSymbols().map(function (symbol) {
                return symbol.getName();
            }),
            [ 'probe' ]
        );
    });

    test('retains a temporal-dead-zone read after removing its pure callee', async function () {
        const source = await emittedCallCase('argument-tdz');
        const declaration = source.getVariableDeclarationOrThrow('later');
        const reads = source.getDescendantsOfKind(SyntaxKind.Identifier).filter(function (identifier) {
            return identifier.getText() === 'later' && identifier !== declaration.getNameNode();
        });
        const [ read ] = reads;
        assertDefined(read);
        assert.strictEqual(reads.length, 1);
        assert.ok(read.getStart() < declaration.getStart());
        assert.strictEqual(declaration.getVariableStatementOrThrow().getDeclarationKind(), VariableDeclarationKind.Let);
    });

    test('does not expose a new strict-mode directive after pruning declarations', async function () {
        const source = await emittedCallCase('preserve-directive-boundary');
        const [ first ] = source.getStatements();
        assertDefined(first);
        const startsWithDirective = TypeScriptMorphNode.isExpressionStatement(first) &&
            TypeScriptMorphNode.isStringLiteral(first.getExpression());
        assert.strictEqual(startsWithDirective, false);
        assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.ThisKeyword).length, 1);
        assert.strictEqual(
            source
                .getDescendantsOfKind(SyntaxKind.BinaryExpression)
                .filter(function (expression) {
                    return expression.getLeft().getText() === 'module.exports';
                })
                .length,
            1
        );
    });

    test('retains assignments to a mapped CommonJS parameter', async function () {
        const source = await emittedCallCase('preserve-parameter-assignment');
        const body = source.getFunctionOrThrow('run').getBodyOrThrow();
        const [ declaration ] = body.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
        assertDefined(declaration);
        assert.strictEqual(declaration.getName(), 'value');
        assert.strictEqual(declaration.getVariableStatementOrThrow().getDeclarationKind(), VariableDeclarationKind.Var);
        assert.strictEqual(
            body.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression).getText(),
            'arguments[0]'
        );
        assert.deepStrictEqual(
            body.getDescendantsOfKind(SyntaxKind.CallExpression).map(function (call) {
                return call.getArguments().map(function (argument) {
                    return argument.getText();
                });
            }),
            [ [ '"effect"' ] ]
        );
    });

    test('retains a live initializer while removing its unused sibling', async function () {
        const source = await emittedCallCase('multiple-declarators');
        const live = source.getVariableDeclarationOrThrow('live').getInitializerOrThrow().asKindOrThrow(
            SyntaxKind.CallExpression
        );
        assert.strictEqual(live.getExpression().getText(), 'pure');
        assert.strictEqual(source.getVariableDeclaration('unused'), undefined);
        assert.deepStrictEqual(
            source
                .getDescendantsOfKind(SyntaxKind.CallExpression)
                .filter(function (call) {
                    return call.getExpression().getText() === 'console.log';
                })
                .map(function (call) {
                    return call.getArguments().map(function (argument) {
                        return argument.getText();
                    });
                }),
            [ [ '"first"' ], [ '"second"' ], [ 'live.value' ] ]
        );
    });
});

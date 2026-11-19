import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Node as TypeScriptMorphNode, SyntaxKind } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { eliminateEntryModule } from '../test-libraries/eliminator-test-support.ts';
import { probeReturnExpression } from '../test-libraries/expression-evaluation-case.ts';
import { withSource } from '../test-libraries/transform-test-support.ts';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';

suite('record behavior through the DCE pipeline', function () {
    test('removes an unused cyclic allocation and its implementation', async function () {
        const source = withSource(
            await eliminateEntryModule(
                'function compute(){const state={self:null,n:1};state.self=state;state.self.n++;return state;}const unused=compute();export function probe(){return 42;}'
            )
        );
        assert.strictEqual(source.getFunction('compute'), undefined);
        assert.strictEqual(source.getVariableDeclaration('unused'), undefined);
        assert.deepStrictEqual(createSourceEvaluation(source).primitiveValue(probeReturnExpression(source)), {
            value: 42
        });
        assert.deepStrictEqual(
            source.getExportSymbols().map(function (symbol) {
                return symbol.getName();
            }),
            [ 'probe' ]
        );
    });

    test('retains publication and later mutation of an escaping record', async function () {
        const source = withSource(
            await eliminateEntryModule(
                'function publish(state){globalThis.saved=state;console.log("escape");}function compute(){const state={n:1};publish(state);state.n=42;return state.n;}export function probe(){return compute();}'
            )
        );
        const body = source.getFunctionOrThrow('compute').getBodyOrThrow();
        const publication = body.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
        const write = body.getDescendantsOfKind(SyntaxKind.BinaryExpression).find(function (expression) {
            return expression.getLeft().getText() === 'state.n';
        });
        assertDefined(write);
        assert.strictEqual(publication.getExpression().getText(), 'publish');
        assert.ok(publication.getStart() < write.getStart());
        assert.strictEqual(
            source
                .getDescendantsOfKind(SyntaxKind.BinaryExpression)
                .filter(function (expression) {
                    return expression.getLeft().getText() === 'globalThis.saved';
                })
                .length,
            1
        );
        assert.strictEqual(
            probeReturnExpression(source).asKindOrThrow(SyntaxKind.CallExpression).getExpression().getText(),
            'compute'
        );
        assert.strictEqual(
            source
                .getDescendantsOfKind(SyntaxKind.CallExpression)
                .filter(function (call) {
                    return call.getExpression().getText() === 'console.log';
                })
                .length,
            1
        );
    });

    test('preserves private-brand failure on an ordinary object with a matching string key', async function () {
        const source = withSource(
            await eliminateEntryModule(
                'class Holder{#answer;read(){return ({"#answer":42}).#answer;}}export function probe(){return new Holder().read();}'
            )
        );
        const holder = source.getClassOrThrow('Holder');
        const access = holder.getMethodOrThrow('read').getFirstDescendantByKindOrThrow(
            SyntaxKind.PropertyAccessExpression
        );
        const [ field ] = access.getExpression().getDescendantsOfKind(SyntaxKind.PropertyAssignment);
        assertDefined(field);
        assert.deepStrictEqual({
            declaredBrand: TypeScriptMorphNode.isPrivateIdentifier(holder.getPropertyOrThrow('#answer').getNameNode()),
            accessedBrand: access.getNameNode().getText(),
            ordinaryKey: field.getNameNode().asKindOrThrow(SyntaxKind.StringLiteral).getLiteralText()
        }, { declaredBrand: true, accessedBrand: '#answer', ordinaryKey: '#answer' });
        assert.strictEqual(createSourceEvaluation(source).primitiveValue(access), undefined);
        assert.deepStrictEqual(
            source.getExportSymbols().map(function (symbol) {
                return symbol.getName();
            }),
            [ 'probe' ]
        );
    });
});

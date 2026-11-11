import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type SourceFile } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createSourceEvaluation } from '../evaluation/constant-evaluation.ts';
import { allNamespaceProperties, namespaceMemberDemand, noNamespaceProperties } from './namespace-demand.ts';
import { namespaceExpressionDemand, type NamespaceExpressionContext } from './namespace-expression-demand.ts';

function expressionContext(source: SourceFile): NamespaceExpressionContext {
    return {
        primitive: createSourceEvaluation(source).primitiveValue,
        binding() {
            return allNamespaceProperties;
        },
        expression() {
            return allNamespaceProperties;
        },
        exported(exportedSource, name) {
            assert.strictEqual(exportedSource, source);
            assert.strictEqual(name, 'ns');
            return namespaceMemberDemand('used', allNamespaceProperties);
        },
        receiverIsUnobserved() {
            return false;
        }
    };
}

suite('namespace expression boundaries', function () {
    suite('computed key boundaries', function () {
        test('does not use an element key as its namespace receiver', function () {
            const source = createProject().createSourceFile('input.ts', 'object["key"];');
            const key = source
                .getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression)
                .getArgumentExpressionOrThrow();
            assert.deepStrictEqual(namespaceExpressionDemand(key, expressionContext(source)), allNamespaceProperties);
        });

        test('does not evaluate an absent constant key initializer', function () {
            const source = createProject().createSourceFile('input.ts', 'const key;ns[key];');
            const access = source.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression);
            const key = access.getArgumentExpressionOrThrow();
            let evaluated = 0;
            assert.deepStrictEqual(
                namespaceExpressionDemand(access.getExpression(), {
                    ...expressionContext(source),
                    primitive(expression) {
                        assert.strictEqual(expression, key);
                        evaluated += 1;
                        return undefined;
                    }
                }),
                allNamespaceProperties
            );
            assert.strictEqual(evaluated, 1);
        });
    });

    for (
        const { content, expected } of [
            { content: 'consume(ns.used);', expected: namespaceMemberDemand('used', noNamespaceProperties) },
            {
                content: [ 'tag`$', '{ns.used}`;' ].join(''),
                expected: namespaceMemberDemand('used', noNamespaceProperties)
            },
            { content: 'object.ns;', expected: allNamespaceProperties },
            { content: 'object[ns];', expected: allNamespaceProperties },
            { content: 'const ns=1;', expected: allNamespaceProperties },
            { content: 'ns;', expected: noNamespaceProperties }
        ]
    ) {
        test(`distinguishes namespace receiver positions for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const value = source.getDescendantsOfKind(SyntaxKind.Identifier).find(function (identifier) {
                return identifier.getText() === 'ns';
            });
            assertDefined(value);
            assert.deepStrictEqual(
                namespaceExpressionDemand(value, {
                    ...expressionContext(source),
                    expression() {
                        return noNamespaceProperties;
                    },
                    binding() {
                        assert.fail('only a namespace initializer transfers binding demand');
                    }
                }),
                expected
            );
        });
    }

    for (const content of [ 'const key;ns[key];', 'ns[];' ]) {
        test(`keeps unknown element keys conservative for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const access = source.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression);
            assert.deepStrictEqual(
                namespaceExpressionDemand(access.getExpression(), expressionContext(source)),
                allNamespaceProperties
            );
        });
    }

    test('transfers namespace export demand through its exported name', function () {
        const source = createProject().createSourceFile('input.ts', 'export * as ns from "./library.js";');
        const exported = source.getFirstDescendantByKindOrThrow(SyntaxKind.NamespaceExport);
        assert.deepStrictEqual(
            namespaceExpressionDemand(exported.getNameNode(), expressionContext(source)),
            new Map([ [ 'used', allNamespaceProperties ] ])
        );
    });

    test('keeps non-expression queries conservative', function () {
        const source = createProject().createSourceFile('input.ts', 'export * as ns from "./library.js";');
        const exported = source.getFirstDescendantByKindOrThrow(SyntaxKind.NamespaceExport);
        assert.deepStrictEqual(namespaceExpressionDemand(exported, expressionContext(source)), allNamespaceProperties);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type SourceFile } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from '../evaluation/constant-evaluation.ts';
import { allNamespaceProperties, namespaceMemberDemand } from './namespace-demand.ts';
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

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { ts, ScriptKind, SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import type { EvaluatedValue } from './primitive-value.ts';

function constructionType(filePath: string, content: string): EvaluatedValue | undefined {
    const project = createProject();
    project.compilerOptions.set({ moduleDetection: ts.ModuleDetectionKind.Legacy });
    const source = project.createSourceFile(filePath, content, { scriptKind: ScriptKind.JS });
    const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.TypeOfExpression);
    return createSourceEvaluation(source).primitiveValue(expression);
}

suite('construction binding scope', function () {
    for (const filePath of [ 'index.cjs', 'index.mjs', 'index.cts', 'index.mts' ]) {
        test(`recognizes module scope from ${filePath}`, function () {
            assert.deepStrictEqual(constructionType(filePath, 'class Empty{}const value=typeof new Empty();'), {
                value: 'object'
            });
        });
    }

    for (const filePath of [ 'index.js', 'index.ts', 'folder.cjs/index.js', 'index.ajs', 'index.cxs' ]) {
        test(`does not infer module scope from ${filePath}`, function () {
            assert.strictEqual(constructionType(filePath, 'class Empty{}const value=typeof new Empty();'), undefined);
        });
    }

    test('recognizes a function-local class in a script', function () {
        assert.deepStrictEqual(
            constructionType('index.js', 'function run(){class Empty{}return typeof new Empty();}'),
            {
                value: 'object'
            }
        );
    });
});

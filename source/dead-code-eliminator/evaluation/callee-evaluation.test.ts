import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import type { Completion } from './evaluation-context.ts';
import { createCallEvaluator } from './callee-evaluation.ts';

suite('function completion boundaries', function () {
    for (const type of [ 'break', 'continue' ] as const) {
        test(`rejects an unconsumed ${type} from the statement evaluator`, function () {
            const source = createProject().createSourceFile('index.ts', 'function compute(){}compute();export{};');
            const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            const context = {
                ...createBoundedEvaluationContext(0, 100),
                execute(): Completion {
                    return { type };
                }
            };
            assert.strictEqual(createCallEvaluator(source)()(call, context), undefined);
        });
    }
});

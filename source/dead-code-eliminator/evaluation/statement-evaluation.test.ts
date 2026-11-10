import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { evaluateStatement } from './statement-evaluation.ts';

suite('return completion proofs', function () {
    test('rejects an unknown return value rather than completing with it', function () {
        const source = createProject().createSourceFile('index.ts', 'function run(){return missing;}');
        const statement = source.getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement);
        assert.strictEqual(evaluateStatement(statement, createBoundedEvaluationContext(0, 100)), undefined);
    });
});

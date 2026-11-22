import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { recursiveCallCases } from '../../test-libraries/recursive-call-cases.ts';
import { variableInitializer } from '../pure-expression-test-support.ts';
import { evaluateLocalCall } from '../../test-libraries/expression-evaluation-case.ts';

suite('recursive call evaluation', function () {
    for (const input of recursiveCallCases) {
        test(`evaluates ${input.name}`, function () {
            const call = variableInitializer(
                `${input.declarations}const result=(()=>${input.expression})();`,
                'result'
            );
            assert.deepStrictEqual(
                evaluateLocalCall(call.asKindOrThrow(SyntaxKind.CallExpression)),
                input.remainingCalls === 0 ? { value: input.value } : undefined
            );
        });
    }
});

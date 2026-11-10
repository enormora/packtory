import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourceEvaluation, createSourceEvaluations } from './constant-evaluation.ts';

suite('shared source evaluations', function () {
    test('evaluates each source once and keeps separate modules distinct', function () {
        const project = createProject();
        const sources = [
            { source: project.createSourceFile('first.ts', 'export{};const base=1;const value=base;'), value: 1 },
            { source: project.createSourceFile('second.ts', 'export{};const base=2;const value=base;'), value: 2 }
        ];
        const initialized = new Set();
        const evaluations = createSourceEvaluations(function (source) {
            assert.strictEqual(initialized.has(source), false);
            initialized.add(source);
            return createSourceEvaluation(source);
        });
        for (const { source, value } of sources) {
            const evaluation = evaluations(source);
            assert.strictEqual(evaluations(source), evaluation);
            assert.deepStrictEqual(
                evaluation.primitiveValue(source.getVariableDeclarationOrThrow('value').getInitializerOrThrow()),
                { value }
            );
        }
        assert.strictEqual(initialized.size, 2);
    });
});

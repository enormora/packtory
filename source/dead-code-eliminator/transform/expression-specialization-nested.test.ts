import assert from 'node:assert';
import { suite, test } from 'mocha';
import { withSource } from '../../test-libraries/transform-test-support.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { specializeExpressions } from './expression-specialization.ts';

suite('nested expression specialization', function () {
    test('specializes an argument without changing its unresolved parent call', function () {
        const source = withSource('export const value = unknown(1 + 2);');
        specializeExpressions(createSourcePreparation(source));
        assert.strictEqual(source.getFullText(), 'export const value = unknown((3));');
    });
});

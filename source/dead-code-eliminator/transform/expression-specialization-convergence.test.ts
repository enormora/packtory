import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { specializeExpressions } from './expression-specialization.ts';

suite('primitive specialization convergence', function () {
    test('specializes an expression at the first source position and then converges', function () {
        const preparation = createSourcePreparation(createProject().createSourceFile('index.js', '(()=>42)();'));
        specializeExpressions(preparation);
        assert.strictEqual(preparation.sourceFile.getFullText(), '(42);');
        specializeExpressions(preparation);
        assert.strictEqual(preparation.sourceFile.getFullText(), '(42);');
    });

    for (const expression of [ '-1', '-0', '1 / 0', '-1 / 0', '0 / 0' ]) {
        test(`leaves the primitive representation ${expression} unchanged`, function () {
            const content = `export const value=(${expression});`;
            const preparation = createSourcePreparation(createProject().createSourceFile('index.js', content));
            specializeExpressions(preparation);
            assert.strictEqual(preparation.sourceFile.getFullText(), content);
        });
    }
});

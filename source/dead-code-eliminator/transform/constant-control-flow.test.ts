import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { simplifyConstantControlFlow } from './constant-control-flow.ts';

suite('constant control flow', function () {
    test('preserves code visible to direct eval', function () {
        const content = 'let value=1;eval("value=2");if(false){consume(value);}export const result=value;';
        const source = createProject().createSourceFile('input.js', content);
        const preparation = createSourcePreparation(source);
        simplifyConstantControlFlow(preparation);
        assert.strictEqual(source.getFullText(), content);
        assert.deepStrictEqual(preparation.transformations, []);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { hasDynamicScope } from './dynamic-scope.ts';

suite('dynamic scope detection', function () {
    for (
        const [ content, expected ] of [
            [ 'ordinary();', false ],
            [ 'with(object){value;}', true ],
            [ 'eval("value");', true ],
            [ '(eval)("value");', true ],
            [ 'globalThis.eval("value");', false ]
        ] as const
    ) {
        test(`classifies ${content}`, function () {
            assert.strictEqual(hasDynamicScope(createProject().createSourceFile('input.js', content)), expected);
        });
    }
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined, assertDeepSubset } from '../../source/test-libraries/deep-subset-assertion.ts';
import { bundleForCodeFile, inputs } from '../../source/test-libraries/eliminator-test-support.ts';
import { createProject } from '../../source/test-libraries/typescript-project.ts';
import { assertDeadCodeEliminationEquivalent } from './runtime-comparison.ts';

suite('fixed function runtime behavior', function () {
    test('preserves strict CommonJS caller access after removing a computation', async function () {
        const content =
            'function strict(){"use strict";let sum=0;for(let index=1;index<=6;index++)sum+=index;return sum;}' +
            'module.exports=function probe(){try{return strict.caller;}catch(error){return error.name;}};';
        const { bundles, observations } = await assertDeadCodeEliminationEquivalent({
            name: 'strict CommonJS function',
            entry: { bundleName: 'package', targetFilePath: 'index.cjs', exportName: 'default' },
            eliminationInputs: inputs(bundleForCodeFile({
                name: 'package',
                inputFilePath: '/source/index.cjs',
                targetFilePath: 'index.cjs',
                content
            }))
        });
        const [ output ] = bundles;
        assertDefined(output);
        assertDeepSubset(observations[0]?.result.observation, { value: 'TypeError' });
        const source = createProject().createSourceFile(
            'output.cjs',
            output.contents[0]?.fileDescription.content ?? ''
        );
        assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.ForStatement).length, 0);
    });
});

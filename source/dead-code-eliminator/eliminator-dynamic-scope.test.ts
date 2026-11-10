import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { assertDeadCodeEliminationEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { hasDynamicScope } from './dynamic-scope.ts';

suite('dynamic scope optimization barriers', function () {
    for (
        const content of [
            'with (scope) { compute(); }',
            'eval("compute()");',
            'compute();eval("compute()");',
            '(eval)("compute()");',
            'function run(eval) { eval("compute()"); }'
        ]
    ) {
        test(`rejects lexical proofs in ${content}`, function () {
            const source = createProject().createSourceFile('index.js', content);
            assert.strictEqual(hasDynamicScope(source), true);
        });
    }

    for (const content of [ 'scope.eval("compute()");', '(0, eval)("compute()");' ]) {
        test(`allows lexical proofs around ${content}`, function () {
            const source = createProject().createSourceFile('index.js', content);
            assert.strictEqual(hasDynamicScope(source), false);
        });
    }

    test('preserves a call whose lexical function is shadowed by a with object', async function () {
        await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
            'function compute(){return 1;}with({compute(){console.log("effect");}}){const unused=compute();}module.exports=()=>42;',
            'index.cjs'
        ));
    });
});

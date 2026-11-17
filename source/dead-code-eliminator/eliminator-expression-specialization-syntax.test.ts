import { suite, test } from 'mocha';
import { assertDeadCodeEliminationOutput } from '../test-libraries/dead-code-elimination-output-assertions.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';

suite('expression specialization syntax boundaries', function () {
    test('preserves a function strict-mode directive in CommonJS', async function () {
        await assertDeadCodeEliminationOutput(
            singleFileOracleCase(
                "function strict(){'use strict';return this===undefined;}module.exports=()=>strict();",
                'index.cjs'
            )
        );
    });

    test('preserves quoted property names in an exported object', async function () {
        await assertDeadCodeEliminationOutput(
            singleFileOracleCase(
                "export const value={'answer':42};export function probe(){return value.answer;}",
                'index.js'
            )
        );
    });
});

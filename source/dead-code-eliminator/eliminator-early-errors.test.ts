import { suite, test } from 'mocha';
import { assertDeadCodeEliminationOutput } from '../test-libraries/dead-code-elimination-output-assertions.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';

suite('early errors during partial evaluation', function () {
    for (
        const condition of [
            '{__proto__:null,__proto__:null}',
            'function(value,value){"use strict";}',
            'class{#value;#value;}',
            '!void(function(value,value){"use strict";})',
            '(class{#value;#value;},true)',
            '(function(value,value){"use strict";})||true'
        ]
    ) {
        test(`preserves early errors in ${condition}`, async function () {
            await assertDeadCodeEliminationOutput(
                singleFileOracleCase(`export function probe(){if(${condition})return 42;return 0;}`, 'index.js')
            );
        });
    }
});

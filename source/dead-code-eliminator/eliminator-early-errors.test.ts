import { suite, test } from 'mocha';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { assertDeadCodeEliminationEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

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
            await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
                `export function probe(){if(${condition})return 42;return 0;}`,
                'index.js'
            ));
        });
    }
});

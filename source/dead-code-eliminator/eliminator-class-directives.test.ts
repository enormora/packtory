import { suite, test } from 'mocha';
import {
    assertSingleFileCallReduction,
    singleFileOracleCase
} from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { assertDeadCodeEliminationEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

suite('class declaration directive boundaries', function () {
    for (
        const content of [
            'module.exports=function(){function read(){class Unused{}"use strict";' +
            'return this===undefined;}return read();};',
            'module.exports=function(){function read(){class First{}class Second{}"use strict";' +
            'return this===undefined;}return read();};',
            'module.exports=function(){function read(value,value){class Unused{}"use strict";' +
            'return value;}return read(1,42);};',
            'module.exports=function(){function read(){"use strict";class Unused{}' +
            'return this===undefined;}return read();};',
            'module.exports=function(){function read(){"custom directive";class Unused{}"use strict";' +
            'return this===undefined;}return read();};'
        ]
    ) {
        test(`preserves strictness in ${content}`, async function () {
            await assertDeadCodeEliminationEquivalent(singleFileOracleCase(content, 'index.cjs'));
        });
    }

    for (const argument of [ '1,42', '42', '1,undefined' ]) {
        test(`retains duplicate parameter calls with arguments ${argument}`, async function () {
            await assertSingleFileCallReduction({
                content: 'function compute(value,value){return value;}' +
                    `module.exports=function(){return compute(${argument});};`,
                targetFilePath: 'index.cjs',
                callee: 'compute',
                remainingCalls: 1
            });
        });
    }
});

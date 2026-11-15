import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

suite('condition effects', function () {
    for (
        const body of [
            'if(!void console.log("condition"))return 42;console.log("unreachable");return 0;',
            'if((console.log("condition"),true))return 42;console.log("unreachable");return 0;',
            'if(!(console.log("condition")&&false))return 42;console.log("unreachable");return 0;',
            'if(console.log("condition")||true)return 42;console.log("unreachable");return 0;',
            'if({effect:console.log("condition")})return 42;console.log("unreachable");return 0;',
            'if([console.log("condition")])return 42;console.log("unreachable");return 0;',
            'return void console.log("condition")?console.log("unreachable"):42;',
            'return (console.log("condition"),true)?42:console.log("unreachable");',
            'return void console.log("condition")??42;',
            'return (console.log("condition"),true)||console.log("unreachable");',
            'return (console.log("condition"),false)&&console.log("unreachable");',
            'if(typeof missing)return 42;console.log("unreachable");return 0;',
            'if(function(){})return 42;console.log("unreachable");return 0;',
            'if(()=>{})return 42;console.log("unreachable");return 0;',
            'if(class{static{console.log("condition");}})return 42;console.log("unreachable");return 0;',
            'do{;;{}}while(false);return 42;'
        ]
    ) {
        test(`selects branches while preserving effects in ${body}`, async function () {
            const fixture = singleFileOracleCase(`export function probe(){${body}}`, 'index.js');
            await assertDeadCodeEliminationEquivalent(fixture);
            const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            const output = result[0]?.contents[0]?.fileDescription.content;
            assertDefined(output);
            assert.doesNotMatch(output, /unreachable/u);
        });
    }

    for (
        const body of [
            'if(!void missing)return 42;return 0;',
            'return {value:missing}?1:2;',
            'return (void missing)??42;',
            'return (console.log("condition"),true)?missing():42;',
            'return (void console.log("condition"))||missing();',
            'do{console.log("once");}while(false);return 42;',
            'do{break;}while(console.log("unread"));return 42;',
            'do{continue;}while((console.log("condition"),false));return 42;',
            'do{}while((console.log("condition"),false));return 42;',
            'if(console.log("condition")&&true)return 42;return 0;',
            'if(console.log("condition")||false)return 42;return 0;',
            'const object={method(){return this===object;}};return ((console.log("condition"),true)&&object.method)();',
            'const object={method(){return this===object;}};return ((console.log("condition"),true)?object.method:null)();',
            'const object={value:42};delete ((console.log("condition"),true)&&object.value);return object.value;'
        ]
    ) {
        test(`preserves runtime behavior in ${body}`, async function () {
            await assertDeadCodeEliminationEquivalent(
                singleFileOracleCase(`export function probe(){${body}}`, 'index.js')
            );
        });
    }
});

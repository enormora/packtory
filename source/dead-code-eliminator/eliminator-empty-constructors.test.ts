import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

suite('empty constructor elimination', function () {
    for (
        const content of [
            'class Empty{constructor(){}}new Empty();',
            'class Empty{constructor(value){;{return;}}}new Empty(console.log("argument"));',
            'function Empty(){}new Empty();',
            'function Empty(value){{;}return;}new Empty(console.log("argument"));',
            'new (function(){})();',
            'new (class{constructor(){}})();',
            'new (class{static{console.log("definition");}constructor(){}})(console.log("argument"));'
        ]
    ) {
        test(`removes construction while preserving effects in ${content}`, async function () {
            const fixture = singleFileOracleCase(`${content}export function probe(){return 42;}`, 'index.js');
            await assertDeadCodeEliminationEquivalent(fixture);
            const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            const output = result[0]?.contents[0]?.fileDescription.content;
            assertDefined(output);
            assert.doesNotMatch(output, /\bnew\b/u);
        });
    }

    for (
        const content of [
            'class Required{constructor(){console.log("construct");}}new Required();',
            'class Required{field=console.log("field");constructor(){}}new Required();',
            'class Required{constructor(value=console.log("default")){}}new Required();',
            'class Required{constructor({value}){}}new Required(null);',
            'function Required(){return {value:42};}export function probe(){return new Required().value;}',
            'function Required(value=console.log("default")){}new Required();',
            'function Required(...values){}new Required(...missing);',
            'function Required({value}){}new Required(null);',
            'function* Required(){}new Required();',
            'async function Required(){}new Required();',
            'new (()=>{})();',
            'function Required(){}Required=missing;new Required();',
            'class Required extends null{constructor(){}}new Required();',
            'function Required(){console.log("construct");}new Required();'
        ]
    ) {
        test(`preserves observable construction in ${content}`, async function () {
            const suffix = content.includes('export function probe') ? '' : 'export function probe(){return 42;}';
            await assertDeadCodeEliminationEquivalent(singleFileOracleCase(content + suffix, 'index.js'));
        });
    }

    test('preserves distinct allocations and inherited property uncertainty', async function () {
        const content = 'function Empty(){}export function probe(){const first=new Empty();' +
            'return [first===first,first===new Empty(),first.constructor===Empty];}';
        await assertDeadCodeEliminationEquivalent(singleFileOracleCase(content, 'index.js'));
    });
});

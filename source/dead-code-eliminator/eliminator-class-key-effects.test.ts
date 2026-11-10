import assert from 'node:assert';
import { suite, test } from 'mocha';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';

suite('class member key effects', function () {
    const members = [ '[KEY](){}', 'get [KEY](){return 1;}', 'set [KEY](value){}', '[KEY]=1;', 'static [KEY]=1;' ];
    for (const member of members) {
        for (const declaration of [ true, false ]) {
            test(`preserves conversion for ${member}, declaration: ${declaration}`, async function () {
                const key = '{toString(){console.log("key");return "member";}}';
                const body = member.replace('KEY', function () {
                    return key;
                });
                const content = declaration ? `class Unused{${body}}` : `const unused=class{${body}};`;
                await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
                    `${content}export function probe(){return 42;}`,
                    'index.js'
                ));
            });
        }
    }

    for (const key of [ '{__proto__:null}', '{toString(){throw new Error("key");}}' ]) {
        test(`preserves conversion errors for ${key}`, async function () {
            await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
                `class Unused{[${key}](){}}export function probe(){return 42;}`,
                'index.js'
            ));
        });
    }

    test('preserves conversion through a constant alias', async function () {
        await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
            'const key={toString(){console.log("key");return "member";}};class Unused{[key](){}}export function probe(){return 42;}',
            'index.js'
        ));
    });

    test('removes an unused class with a proven primitive computed key', async function () {
        const fixture = singleFileOracleCase(
            'class Unused{["a"+"b"](){}}export function probe(){return 42;}',
            'index.js'
        );
        await assertDeadCodeEliminationEquivalent(fixture);
        const [ output ] = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
        assertDefined(output);
        assert.strictEqual(
            output.contents.some(function (resource) {
                return resource.fileDescription.content.includes('class Unused');
            }),
            false
        );
    });
});

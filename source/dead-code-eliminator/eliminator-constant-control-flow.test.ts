import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import {
    bundleForCodeFile,
    inputWithoutTransformations
} from '../test-libraries/eliminator-test-support.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';

const removable = [
    'if (false) { console.log("unreachable"); }',
    'if (true) { console.log("live"); } else { console.log("unreachable"); }',
    'false && console.log("unreachable"); true || console.log("unreachable");',
    '0 ?? console.log("unreachable"); null ?? 42;',
    'const unused = false && console.log("unreachable");',
    'const unused = true ? 42 : console.log("unreachable");',
    'if (true) { if (false) { console.log("unreachable"); } else { console.log("live"); } }',
    'function condition() { return false; } if (condition()) { console.log("unreachable"); }',
    'if ({}) { console.log("live"); } else { console.log("unreachable"); }',
    'class Empty {} if (new Empty()) { console.log("live"); } else { console.log("unreachable"); }',
    '({ valueOf() { throw 1; } }) || console.log("unreachable");',
    '({}) ?? console.log("unreachable");'
];

const required = [
    'if (false) { var required = 42; } console.log(required);',
    'const object = { method() { console.log(this === object); } }; (true && object.method)();',
    'const object = { method() { console.log(this === object); } }; (false ? null : object.method)();',
    'typeof (true && missing);',
    'const hidden = 42; console.log((true ? eval : missing)("typeof hidden"));',
    'const object = { value: 42 }; delete (true && object.value); console.log(object.value);',
    'if (console.log("condition")) { console.log("then"); } else { console.log("else"); }',
    'if (value) { console.log("live"); } const value = true;',
    'if (false) { let invisible = 42; } eval("typeof invisible");',
    'console.log("left") || console.log("right");',
    'if (false) { console.log("dead"); } else if (console.log("condition")) { console.log("live"); }',
    'function read() { return value; var value = console.log("unreachable"); } console.log(read());',
    'function read() { return value; let value = console.log("unreachable"); } read();',
    'function read() { return value(); function value() { return 42; } } console.log(read());',
    'function read() { try { throw 1; } catch { console.log("caught"); } return 42; } console.log(read());',
    'function read() { label: { break label; } console.log("reachable"); return 42; } console.log(read());',
    'if ({ value: missing }) { console.log("live"); }',
    'class Required { constructor() { console.log("construct"); } } if (new Required()) { console.log("live"); }',
    'if (new class extends null {}()) { console.log("live"); }',
    'const object=({})||missing; console.log(object===object);'
];

const commonJs = [
    '"use strict"; module.exports = function () { return this === undefined; };',
    '42; "use strict"; module.exports = function () { return this === undefined; };',
    'if (false) { console.log("dead"); } "use strict"; module.exports = function () { return this === undefined; };',
    'module.exports = function () { "use strict"; return this === undefined; };',
    'module.exports = function () { 42; "use strict"; return this === undefined; };',
    'if (false) { function required() { return 1; } } module.exports = () => typeof required;'
];

suite('constant control flow elimination', function () {
    suite('proven instance truthiness', function () {
        for (
            const content of [
                'class Empty {} export const value = new Empty() ? 42 : 0;',
                'function compute() { class Empty {} return new Empty() ? 42 : 0; } export const value = compute();'
            ]
        ) {
            test(`removes proven instance truthiness in ${content}`, async function () {
                const fixture = singleFileOracleCase(
                    `${content} export function probe() { return value; }`,
                    'index.js'
                );
                await assertDeadCodeEliminationEquivalent(fixture);
                const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
                const output = result[0]?.contents[0]?.fileDescription.content;
                assertDefined(output);
                assert.doesNotMatch(output, /\b(?:class|new|compute)\b/u);
            });
        }
    });

    suite('branch selection', function () {
        for (const content of removable) {
            test(`removes unreachable operations in ${content}`, async function () {
                const fixture = singleFileOracleCase(`${content}\nexport function probe() { return 42; }`, 'index.js');
                await assertDeadCodeEliminationEquivalent(fixture);
                const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
                assert.strictEqual(result[0]?.contents[0]?.fileDescription.content.includes('unreachable'), false);
            });
        }

        test('removes unreachable operations inside a public function', async function () {
            const fixture = singleFileOracleCase(
                'export function probe() { if (false) { console.log("unreachable"); } return 42; }',
                'index.js'
            );
            await assertDeadCodeEliminationEquivalent(fixture);
            const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            assert.strictEqual(result[0]?.contents[0]?.fileDescription.content.includes('unreachable'), false);
        });

        for (
            const body of [
                'if (true) { return 42; } console.log("unreachable");',
                'if (Math.random()) { return 42; } else { return 42; } console.log("unreachable");',
                'try { throw 42; } catch (value) { return value; } console.log("unreachable");',
                'try { console.log("live"); } finally { return 42; } console.log("unreachable");'
            ]
        ) {
            test(`removes a public function tail after ${body}`, async function () {
                const fixture = singleFileOracleCase(`export function probe() { ${body} }`, 'index.js');
                await assertDeadCodeEliminationEquivalent(fixture);
                const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
                assert.strictEqual(result[0]?.contents[0]?.fileDescription.content.includes('unreachable'), false);
            });
        }

        for (const content of required) {
            test(`preserves required behavior in ${content}`, async function () {
                await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
                    `${content}\nexport function probe() { return 42; }`,
                    'index.js'
                ));
            });
        }

        for (const content of commonJs) {
            test(`preserves CommonJS directives and declarations in ${content}`, async function () {
                await assertDeadCodeEliminationEquivalent(singleFileOracleCase(content, 'index.cjs'));
            });
        }

        test('preserves source when transformations are disabled', async function () {
            const content = 'if (false) { console.log("unreachable"); } export function probe() { return 42; }';
            const bundle = bundleForCodeFile({
                name: 'package',
                inputFilePath: '/source/index.js',
                targetFilePath: 'index.js',
                content
            });
            const result = await createTestEliminator().eliminate(inputWithoutTransformations(bundle));
            assert.strictEqual(result[0]?.contents[0]?.fileDescription.content, content);
        });
    });
});

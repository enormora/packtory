import assert from 'node:assert';
import { suite, test } from 'mocha';
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
    'function condition() { return false; } if (condition()) { console.log("unreachable"); }'
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
    'if (false) { console.log("dead"); } else if (console.log("condition")) { console.log("live"); }'
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

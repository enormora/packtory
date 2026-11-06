import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

async function eliminate(content: string): Promise<string> {
    const [ result ] = await createTestEliminator().eliminate(inputs(bundleForCodeFile({
        name: 'package',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content
    })));
    const file = result?.contents[0];
    assertDefined(file);
    return file.fileDescription.content;
}

async function observe(content: string): Promise<unknown> {
    const address = `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
    return runNodeProbe(`
        globalThis.events = [];
        await import(${JSON.stringify(address)})
            .then(module => events.push(module.value))
            .catch(error => events.push(error.message));
        console.log(JSON.stringify(events));
    `);
}

suite('eliminator computed key effects', function () {
    const cases = [
        {
            name: 'toString effects',
            key: '{ toString() { events.push("key"); return "x"; } }',
            expected: [ 'key', 42 ]
        },
        {
            name: 'valueOf fallback effects',
            key: '{ toString() { events.push("string"); return {}; }, valueOf() { events.push("value"); return 1; } }',
            expected: [ 'string', 'value', 42 ]
        },
        {
            name: 'Symbol.toPrimitive effects and the string hint',
            key: '{ [Symbol.toPrimitive](hint) { events.push(hint); return Symbol(); } }',
            expected: [ 'string', 42 ]
        },
        {
            name: 'throwing coercion',
            key: '{ toString() { throw new Error("coercion failed"); } }',
            expected: [ 'coercion failed' ]
        },
        {
            name: 'coercion of a Symbol description',
            key: 'Symbol({ toString() { events.push("description"); return "x"; } })',
            expected: [ 'description', 42 ]
        },
        {
            name: 'array coercion',
            key: '[{ toString() { events.push("element"); return "x"; } }]',
            expected: [ 'element', 42 ]
        },
        {
            name: 'callable coercion',
            key: 'function () {}',
            expected: [ 'function', 42 ]
        }
    ];
    for (const scenario of cases) {
        for (const member of [ '[key]: 1', '[key]() {}', 'get [key]() {}', 'set [key](value) {}' ]) {
            test(`preserves ${scenario.name} in ${member}`, async function () {
                const content = [
                    `const key = ${scenario.key};`,
                    ...scenario.name === 'callable coercion'
                        ? [ 'key.toString = () => { events.push("function"); return "x"; };' ]
                        : [],
                    `const unused = { ${member} };`,
                    'export const value = 42;'
                ]
                    .join('\n');

                assert.deepStrictEqual(await observe(content), scenario.expected);
                assert.deepStrictEqual(await observe(await eliminate(content)), scenario.expected);
            });
        }
    }

    for (const key of [ '"x"', '1', '1n', 'true', 'false', 'null', 'undefined', '`x`', 'Symbol()', 'Symbol("x")' ]) {
        test(`removes an unused object with primitive key ${key}`, async function () {
            const content =
                `const key = ${key}; const alias = key; const unused = { [alias]: 1 }; export const value = 42;`;
            const emitted = await eliminate(content);

            assert.strictEqual(emitted.includes('unused'), false);
            assert.strictEqual(emitted.includes('alias'), false);
            assert.deepStrictEqual(await observe(emitted), [ 42 ]);
        });
    }
});

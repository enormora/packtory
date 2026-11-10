import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { bundleForCodeFile, inputs, eliminateCodeModules } from '../test-libraries/eliminator-test-support.ts';
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

function moduleAddress(content: string): string {
    return `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
}

async function observe(content: string): Promise<unknown> {
    const address = moduleAddress(content);
    return runNodeProbe(`
        globalThis.events = [];
        await import(${JSON.stringify(address)})
            .then(module => events.push(module.value))
            .catch(error => events.push(error.message));
        console.log(JSON.stringify(events));
    `);
}

async function observeModules(modules: ReadonlyMap<string, string>): Promise<unknown> {
    const entry = modules.get('index.js');
    const dependency = modules.get('replacement.js');
    assertDefined(entry);
    assertDefined(dependency);
    return observe(entry.replace('./replacement.js', function () {
        return moduleAddress(dependency);
    }));
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

    for (
        const key of [
            '"x"',
            '1',
            '1n',
            'true',
            'false',
            'null',
            'undefined',
            '`x`',
            '(() => "x")()',
            '((n) => { if(n < 0) events.push("never"); return n; })(1)',
            '(() => { let n=0; for(let i=0;i<3;i++)n+=i; return n; })()'
        ]
    ) {
        test(`removes an unused object with primitive key ${key}`, async function () {
            const content =
                `const key = ${key}; const alias = key; const unused = { [alias]: 1 }; export const value = 42;`;
            const emitted = await eliminate(content);

            assert.strictEqual(emitted.includes('unused'), false);
            assert.strictEqual(emitted.includes('alias'), false);
            assert.deepStrictEqual(await observe(content), [ 42 ]);
            assert.deepStrictEqual(await observe(emitted), [ 42 ]);
        });
    }

    suite('Symbol replacement effects', function () {
        const replacement = '()=>{events.push("call");return {toString(){events.push("coerce");return "x";}};}';
        const changes = [
            { name: 'global alias', code: `const realm=globalThis;realm.Symbol=${replacement};`, reads: [] },
            { name: 'Reflect.set', code: `Reflect.set(globalThis,"Symbol",${replacement});`, reads: [] },
            { name: 'direct assignment', code: `globalThis.Symbol=${replacement};`, reads: [] },
            {
                name: 'property definition',
                code: `Object.defineProperty(globalThis,"Symbol",{value:${replacement}});`,
                reads: []
            },
            {
                name: 'global getter',
                code: `Object.defineProperty(globalThis,"Symbol",{get(){events.push("read");return ${replacement};}});`,
                reads: [ 'read' ]
            }
        ];
        const operations = [
            { code: 'const unused=Symbol("x");', conversion: [] },
            { code: 'const unused={[Symbol("x")]:1};', conversion: [ 'coerce' ] },
            { code: 'const unused={[Symbol("x")](){}};', conversion: [ 'coerce' ] },
            { code: 'const unused={get [Symbol("x")](){}};', conversion: [ 'coerce' ] },
            { code: 'const key=Symbol("x");const alias=key;const unused={[alias]:1};', conversion: [ 'coerce' ] }
        ];
        for (const change of changes) {
            for (const operation of operations) {
                test(`preserves Symbol effects through ${change.name} for ${operation.code}`, async function () {
                    const content = `${change.code}${operation.code}export const value=42;`;
                    const expected = [ ...change.reads, 'call', ...operation.conversion, 42 ];
                    assert.deepStrictEqual(await observe(content), expected);
                    assert.deepStrictEqual(await observe(await eliminate(content)), expected);
                });
            }
        }

        test('preserves replacement effects from another module', async function () {
            const change = `Reflect.set(globalThis,"Symbol",${replacement});`;
            const content = 'import "./replacement.js";const unused={[Symbol("x")]:1};export const value=42;';
            const expected = [ 'call', 'coerce', 42 ];
            assert.deepStrictEqual(
                await observeModules(new Map([ [ 'index.js', content ], [ 'replacement.js', change ] ])),
                expected
            );
            assert.deepStrictEqual(
                await observeModules(await eliminateCodeModules(content, { 'replacement.js': change })),
                expected
            );
        });
    });
});

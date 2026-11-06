import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

async function emittedCode(content: string): Promise<string> {
    const bundle = bundleForCodeFile({
        name: 'package',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content
    });
    const [ analyzed ] = await createTestEliminator().eliminate(inputs(bundle));
    const emitted = analyzed?.contents[0];
    assertDefined(emitted);
    return emitted.fileDescription.content;
}

async function observe(content: string): Promise<unknown> {
    const address = `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
    return runNodeProbe([
        'globalThis.events = [];',
        'try {',
        `    const module = await import(${JSON.stringify(address)});`,
        '    console.log(JSON.stringify({ value: module.value, events: globalThis.events, error: null }));',
        '} catch (error) {',
        '    console.log(JSON.stringify({ events: globalThis.events, error: error.message }));',
        '}'
    ]
        .join('\n'));
}

suite('eliminator destructuring effects', function () {
    const cases = [
        {
            name: 'a default for a missing property',
            declarations: [ 'const { x = events.push("default") } = {};' ],
            events: [ 'default' ],
            error: null
        },
        {
            name: 'a default for an explicitly undefined property',
            declarations: [ 'const { x = events.push("default") } = { x: undefined };' ],
            events: [ 'default' ],
            error: null
        },
        {
            name: 'a bypassed default for a defined property',
            declarations: [ 'const { x = events.push("default") } = { x: 0 };' ],
            events: [],
            error: null
        },
        {
            name: 'a bypassed default for a null property',
            declarations: [ 'const { x = events.push("default") } = { x: null };' ],
            events: [],
            error: null
        },
        {
            name: 'nested defaults and their referenced dependencies',
            declarations: [
                'function fallback() { events.push("outer"); return {}; }',
                'const { nested: { x = events.push("inner") } = fallback() } = {};'
            ],
            events: [ 'outer', 'inner' ],
            error: null
        },
        {
            name: 'a throwing default',
            declarations: [
                'function fallback() { events.push("default"); throw new Error("default failed"); }',
                'const { x = fallback() } = {};'
            ],
            events: [ 'default' ],
            error: 'default failed'
        },
        {
            name: 'a bypassed throwing default',
            declarations: [
                'function fallback() { throw new Error("default failed"); }',
                'const { x = fallback() } = { x: false };'
            ],
            events: [],
            error: null
        },
        {
            name: 'array defaults for holes and undefined elements',
            declarations: [ 'const [ x = events.push("hole"), y = events.push("undefined") ] = [, undefined];' ],
            events: [ 'hole', 'undefined' ],
            error: null
        },
        {
            name: 'a bypassed array default',
            declarations: [ 'const [ x = events.push("default") ] = [0];' ],
            events: [],
            error: null
        },
        {
            name: 'a getter bypassing a default',
            declarations: [
                'const { x = events.push("default") } = { get x() { events.push("get"); return 0; } };'
            ],
            events: [ 'get' ],
            error: null
        },
        {
            name: 'a default next to an unused declarator',
            declarations: [ 'const dead = 1, { x = events.push("default") } = {};' ],
            events: [ 'default' ],
            error: null
        },
        {
            name: 'a getter with side effects through a receiver binding',
            declarations: [
                'const object = { get x() { events.push("get"); return 3; } };',
                'const { x: unused } = object;'
            ],
            events: [ 'get' ],
            error: null
        },
        {
            name: 'a throwing getter',
            declarations: [
                'const object = { get x() { throw new Error("getter failed"); } };',
                'const { x: unused } = object;'
            ],
            events: [],
            error: 'getter failed'
        },
        {
            name: 'a nested getter in an inline receiver',
            declarations: [ 'const { nested: { x: unused } } = { nested: { get x() { events.push("nested"); } } };' ],
            events: [ 'nested' ],
            error: null
        },
        {
            name: 'getters enumerated by object rest',
            declarations: [ 'const { ...unused } = { get x() { events.push("rest"); } };' ],
            events: [ 'rest' ],
            error: null
        },
        {
            name: 'a getter followed by a default initializer',
            declarations: [
                'function fallback() { events.push("default"); return 1; }',
                'const { x: unused = fallback() } = { get x() { events.push("get"); } };'
            ],
            events: [ 'get', 'default' ],
            error: null
        },
        {
            name: 'a computed key before a getter',
            declarations: [
                'function key() { events.push("key"); return "x"; }',
                'const { [key()]: unused } = { get x() { events.push("get"); } };'
            ],
            events: [ 'key', 'get' ],
            error: null
        },
        {
            name: 'receiver evaluation before a getter',
            declarations: [
                'function receiver() { events.push("receiver"); return { get x() { events.push("get"); } }; }',
                'const { x: unused } = receiver();'
            ],
            events: [ 'receiver', 'get' ],
            error: null
        },
        {
            name: 'array iterator effects without bound names',
            declarations: [
                'const iterable = { *[Symbol.iterator]() { events.push("iterate"); yield 1; } };',
                'const [,] = iterable;'
            ],
            events: [ 'iterate' ],
            error: null
        },
        {
            name: 'receiver evaluation for an empty object pattern',
            declarations: [
                'function receiver() { events.push("receiver"); return {}; }',
                'const {} = receiver();'
            ],
            events: [ 'receiver' ],
            error: null
        },
        {
            name: 'an empty pattern throwing on a null receiver',
            declarations: [ 'const {} = null;' ],
            events: [],
            error: "Cannot destructure 'null' as it is null."
        },
        {
            name: 'a getter next to an unused declarator',
            declarations: [ 'const dead = 1, { x: unused } = { get x() { events.push("get"); } };' ],
            events: [ 'get' ],
            error: null
        }
    ];

    for (const scenario of cases) {
        test(`preserves ${scenario.name}`, async function () {
            const content = [ ...scenario.declarations, 'export const value = 42;' ].join('\n');
            const expected = scenario.error === null
                ? { value: 42, events: scenario.events, error: null }
                : { events: scenario.events, error: scenario.error };

            assert.deepStrictEqual(await observe(content), expected);
            assert.deepStrictEqual(await observe(await emittedCode(content)), expected);
        });
    }

    test('removes an unused object whose getter is never invoked', async function () {
        const content = [
            'const unused = { get x() { events.push("get"); } };',
            'export const value = 42;'
        ]
            .join('\n');
        const emitted = await emittedCode(content);

        assert.strictEqual(emitted.includes('unused'), false);
        assert.deepStrictEqual(await observe(emitted), { value: 42, events: [], error: null });
    });
});

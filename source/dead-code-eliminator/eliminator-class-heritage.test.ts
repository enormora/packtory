import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { eliminateCodeModules } from '../test-libraries/eliminator-test-support.ts';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

async function eliminate(content: string): Promise<string> {
    const modules = await eliminateCodeModules(content, {});
    const emitted = modules.get('index.js');
    assertDefined(emitted);
    return emitted;
}

async function observe(content: string): Promise<unknown> {
    const address = `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
    return runNodeProbe(`
        try {
            const module = await import(${JSON.stringify(address)});
            console.log(JSON.stringify({ value: module.value }));
        } catch (error) {
            console.log(JSON.stringify({ error: error.name }));
        }
    `);
}

suite('eliminator class heritage', function () {
    const invalidHeritage = [
        '3',
        'true',
        '"base"',
        'undefined',
        '{}',
        '() => {}',
        'async function () {}',
        'function* () {}',
        'async function* () {}',
        'class extends 3 {}'
    ];
    for (const heritage of invalidHeritage) {
        for (const prefix of [ 'class Unused', 'const unused = class' ]) {
            test(`preserves TypeError for ${prefix} extends ${heritage}`, async function () {
                const content = `${prefix} extends (${heritage}) {}; export const value = 42;`;

                assert.deepStrictEqual(await observe(content), { error: 'TypeError' });
                assert.deepStrictEqual(await observe(await eliminate(content)), { error: 'TypeError' });
            });
        }
    }

    for (const heritage of [ 'null', 'function () {}', 'class {}', 'class extends null {}' ]) {
        for (const prefix of [ 'class Unused', 'const unused = class' ]) {
            test(`removes ${prefix} with proven safe heritage ${heritage}`, async function () {
                const content = `${prefix} extends (${heritage}) {}; export const value = 42;`;
                const emitted = await eliminate(content);

                assert.strictEqual(emitted.includes('class'), false);
                assert.deepStrictEqual(await observe(content), { value: 42 });
                assert.deepStrictEqual(await observe(emitted), { value: 42 });
            });
        }
    }

    for (
        const declaration of [
            'function Base() {} Base.prototype = 3; class Unused extends Base {}',
            'const Base = (() => {}).bind(null); class Unused extends Base {}',
            'class Unused extends Missing {}',
            'class Unused extends Unused {}',
            'class Unused extends Base {} class Base {}',
            'const unused = class { static { throw new Error(); } };',
            'class Unused extends (class { static { throw new Error(); } }) {}',
            'const unused = class { static value = missing(); };'
        ]
    ) {
        test(`preserves class definition errors in ${declaration}`, async function () {
            const content = `${declaration}; export const value = 42;`;
            const original = await observe(content);

            assert.notDeepStrictEqual(original, { value: 42 });
            assert.deepStrictEqual(await observe(await eliminate(content)), original);
        });
    }
});

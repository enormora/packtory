import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { eliminateCodeModules } from '../test-libraries/eliminator-test-support.ts';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

const dependency = [
    'globalThis.events.push("lazy");',
    'export const value = 42;',
    'export const extra = 3;',
    'export default 9;',
    'const unused = 123;'
]
    .join('\n');

function moduleAddress(content: string): string {
    return `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
}

async function observe(entry: string, lazy: string): Promise<unknown> {
    const address = moduleAddress(entry.replaceAll('./lazy.js', function () {
        return moduleAddress(lazy);
    }));
    return runNodeProbe(`
        globalThis.events = [];
        const module = await import(${JSON.stringify(address)});
        const before = [...globalThis.events];
        const value = await module.probe();
        console.log(JSON.stringify({ before, value, events: globalThis.events }));
    `);
}

suite('eliminator dynamic import', function () {
    for (const separator of [ '\n', ' ' ]) {
        for (
            const expression of [
                '(await import("./lazy.js")).value',
                'import("./lazy.js").then(ns => [ns.value, Object.keys(ns)])',
                '(await import("./lazy.js"))',
                '(await import("./lazy.js")).default'
            ]
        ) {
            test(`preserves ${expression} with separator ${JSON.stringify(separator)}`, async function () {
                const content = [
                    'globalThis.events.push("entry");',
                    'export async function probe() {',
                    'globalThis.events.push("start-import");',
                    `return ${expression};`,
                    '}'
                ]
                    .join(separator);
                const emitted = await eliminateCodeModules(content, { 'lazy.js': dependency });
                const entry = emitted.get('index.js');
                const lazy = emitted.get('lazy.js');
                assertDefined(entry);
                assertDefined(lazy);

                assert.deepStrictEqual(await observe(entry, lazy), await observe(content, dependency));
                assert.strictEqual(lazy.includes('unused'), false);
            });
        }
    }

    test('prunes an unreachable dynamic import and its pure target', async function () {
        const emitted = await eliminateCodeModules(
            'function unused() { return import("./lazy.js"); }\nexport const value = 1;',
            { 'lazy.js': 'export const value = 42;\nexport const extra = 3;' }
        );

        assert.deepStrictEqual(Array.from(emitted.keys()), [ 'index.js' ]);
        assert.strictEqual(emitted.get('index.js')?.includes('import('), false);
    });
});

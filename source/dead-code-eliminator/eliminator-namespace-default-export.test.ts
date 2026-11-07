import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { eliminateCodeModules } from '../test-libraries/eliminator-test-support.ts';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

function moduleAddress(content: string): string {
    return `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
}

async function observe(modules: ReadonlyMap<string, string>): Promise<unknown> {
    const dependency = modules.get('dep.js');
    const barrel = modules.get('barrel.js');
    const entry = modules.get('index.js');
    assertDefined(dependency);
    assertDefined(barrel);
    assertDefined(entry);
    const barrelAddress = moduleAddress(barrel.replace('./dep.js', function () {
        return moduleAddress(dependency);
    }));
    const address = moduleAddress(entry.replace('./barrel.js', function () {
        return barrelAddress;
    }));
    return runNodeProbe(`
        const module = await import(${JSON.stringify(address)});
        console.log(JSON.stringify(module.value));
    `);
}

suite('eliminator namespace default export', function () {
    for (
        const statement of [ 'export default ns;', 'export default (ns);', 'const alias = ns; export default alias;' ]
    ) {
        test(`preserves the namespace through ${statement}`, async function () {
            const entry = 'import ns from "./barrel.js"; export const value = ns.used;';
            const modules = {
                'barrel.js': `import * as ns from "./dep.js"; ${statement}`,
                'dep.js': 'export const used = 42; export const unused = 9; const dead = 123;'
            };
            const original = await observe(new Map([ [ 'index.js', entry ], ...Object.entries(modules) ]));
            assert.strictEqual(original, 42);
            const emitted = await eliminateCodeModules(entry, modules);

            assert.strictEqual(await observe(emitted), original);
            assert.strictEqual(emitted.get('dep.js')?.includes('dead'), false);
        });
    }
});

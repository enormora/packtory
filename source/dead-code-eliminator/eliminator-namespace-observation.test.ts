import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';

const dependency = [
    'export let value = 0;',
    'export function increment() { value++; }',
    'export const other = 9;',
    'export const renamed = 7;',
    'export default function fallback() { return 5; }',
    'const unused = 123;'
]
    .join('\n');

type EmittedModules = {
    readonly entry: string;
    readonly dependency: string;
};

async function eliminate(content: string, dependencyContent: string): Promise<EmittedModules> {
    const [ result ] = await createTestEliminator().eliminate(inputs(bundleForCodeFile({
        name: 'package',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content,
        extraResources: [ {
            ...bundleResource('/source/dep.js', { content: dependencyContent, targetFilePath: 'dep.js' }),
            isSubstituted: false
        } ]
    })));
    assertDefined(result);
    const emitted = new Map(result.contents.map(function (resource) {
        return [ resource.fileDescription.targetFilePath, resource.fileDescription.content ];
    }));
    const entry = emitted.get('index.js');
    const emittedDependency = emitted.get('dep.js');
    assertDefined(entry);
    assertDefined(emittedDependency);
    return { entry, dependency: emittedDependency };
}

function moduleAddress(content: string): string {
    return `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
}

async function observe(content: string, dependencyContent: string): Promise<unknown> {
    const address = moduleAddress(content.replace('./dep.js', function () {
        return moduleAddress(dependencyContent);
    }));
    return runNodeProbe(`
        const module = await import(${JSON.stringify(address)});
        console.log(JSON.stringify([module.probe(), Object.keys(module.exposed ?? module.ns ?? {})]));
    `);
}

suite('eliminator namespace observation', function () {
    const cases = [
        { name: 'Object.keys', expression: 'Object.keys(ns)' },
        { name: 'Reflect.ownKeys', expression: 'Reflect.ownKeys(ns).map(String)' },
        { name: 'unknown consumer', expression: '((value) => Object.keys(value))(ns)' },
        { name: 'alias', expression: '(() => { const alias = ns; return Object.keys(alias); })()' },
        { name: 'shorthand property', expression: 'Object.keys(({ ns }).ns)' },
        { name: 'object spread', expression: 'Object.keys({ ...ns })' },
        { name: 'computed property', expression: 'ns[["other"].join("")]' },
        { name: 'returned namespace', expression: 'ns' }
    ];
    for (const scenario of cases) {
        test(`preserves exports and live bindings for ${scenario.name}`, async function () {
            const content = [
                'import * as ns from "./dep.js";',
                `export function probe() { ns.increment(); return [ns.value, ${scenario.expression}]; }`
            ]
                .join('\n');
            const { entry, dependency: emittedDependency } = await eliminate(content, dependency);

            assert.deepStrictEqual(await observe(entry, emittedDependency), await observe(content, dependency));
            assert.strictEqual(emittedDependency.includes('unused'), false);
            assert.ok(emittedDependency.includes('other'));
        });
    }

    test('still prunes unused exports for property-only reads', async function () {
        const content = [
            'import * as ns from "./dep.js";',
            'export function probe() { ns.increment(); return ns.value; }'
        ]
            .join('\n');
        const { entry, dependency: emittedDependency } = await eliminate(content, dependency);

        assert.deepStrictEqual(await observe(entry, emittedDependency), [ 1, [] ]);
        assert.strictEqual(emittedDependency.includes('other'), false);
        assert.strictEqual(emittedDependency.includes('renamed'), false);
        assert.strictEqual(emittedDependency.includes('fallback'), false);
    });

    test('does not retain exports for unreachable namespace observations or shadowed names', async function () {
        const content = [
            'import * as ns from "./dep.js";',
            'function unused() { return Object.keys(ns); }',
            'export function probe() { ns.increment(); return ((ns) => Object.keys(ns))({x: ns.value}); }'
        ]
            .join('\n');
        const { entry, dependency: emittedDependency } = await eliminate(content, dependency);

        assert.deepStrictEqual(await observe(entry, emittedDependency), [ [ 'x' ], [] ]);
        assert.strictEqual(entry.includes('unused'), false);
        assert.strictEqual(emittedDependency.includes('other'), false);
    });

    for (const statement of [ 'export { ns };', 'export { ns as exposed };' ]) {
        test(`retains all exports when a namespace is exported through ${statement}`, async function () {
            const content = `import * as ns from "./dep.js"; ${statement} export function probe() { return 0; }`;
            const { entry, dependency: emittedDependency } = await eliminate(content, dependency);

            assert.deepStrictEqual(await observe(entry, emittedDependency), await observe(content, dependency));
        });
    }

    test('retains local export aliases and their values when the namespace is observed', async function () {
        const content = 'import * as ns from "./dep.js"; export function probe() { return [Object.keys(ns), ns]; }';
        const dependencyContent = 'const value = 7; export { value as renamed }; export default 9;';
        const { entry, dependency: emittedDependency } = await eliminate(content, dependencyContent);

        assert.deepStrictEqual(await observe(entry, emittedDependency), await observe(content, dependencyContent));
    });
});

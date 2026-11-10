import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { eliminateCodeModules } from '../test-libraries/eliminator-test-support.ts';
import { runNodeProbe } from '../test-libraries/run-node-probe.ts';
import { createProject } from '../test-libraries/typescript-project.ts';

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
    const emitted = await eliminateCodeModules(content, { 'dep.js': dependencyContent });
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

    suite('member call receivers', function () {
        const receivers = [
            { name: 'unused receiver', declaration: 'export function used(){return 42;}', retained: false },
            { name: 'arrow function', declaration: 'export const used=()=>42;', retained: false },
            { name: 'function expression', declaration: 'export const used=function(){return 42;};', retained: false },
            {
                name: 'throwing function',
                declaration: 'export function used(){throw new Error("called");}',
                retained: false
            },
            { name: 'receiver property', declaration: 'export function used(){return this.spare;}', retained: true },
            {
                name: 'default parameter',
                declaration: 'export function used(value=this.spare){return value;}',
                retained: true
            },
            { name: 'nested arrow', declaration: 'export function used(){return (()=>this.spare)();}', retained: true },
            { name: 'direct eval', declaration: 'export function used(){return eval("this.spare");}', retained: true },
            {
                name: 'reassignment',
                declaration: 'export function used(){return 42;}used=function(){return this.spare;};',
                retained: true
            },
            {
                name: 'proxy',
                declaration: 'export const used=new Proxy(()=>42,{apply(target,receiver){return receiver.spare;}});',
                retained: true
            },
            { name: 'class call error', declaration: 'export class used {}', retained: true }
        ];
        for (const scenario of receivers) {
            test(`preserves ${scenario.name}`, async function () {
                const content =
                    'import * as ns from "./dep.js";export function probe(){try{return ns.used();}catch(error){return error.name+":"+error.message;}}';
                const originalDependency = `${scenario.declaration}export const spare=13;`;
                const { entry, dependency: emittedDependency } = await eliminate(content, originalDependency);
                const source = createProject().createSourceFile('output.js', emittedDependency);
                assert.deepStrictEqual(
                    await observe(entry, emittedDependency),
                    await observe(content, originalDependency)
                );
                assert.strictEqual(source.getVariableDeclaration('spare') !== undefined, scenario.retained);
            });
        }
    });
});

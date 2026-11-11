import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { assertDeadCodeEliminationBehaviorEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { createDeadCodeEliminator, type InspectableDeadCodeEliminator } from './eliminator.ts';

type BuilderCase = {
    readonly name: string;
    readonly dependency: string;
    readonly computeBody: string;
    readonly program: string;
    readonly removesComputation: boolean;
};

function builderEliminator(dependency: string): InspectableDeadCodeEliminator {
    return createDeadCodeEliminator({
        createProject() {
            return createProject({
                withFiles: [
                    {
                        filePath: '/repo/node_modules/schema-lib/package.json',
                        content: '{"type":"module","exports":"./index.js"}'
                    },
                    { filePath: '/repo/node_modules/schema-lib/index.js', content: dependency }
                ]
            });
        },
        progressBroadcaster: {
            emit() {
                return undefined;
            },
            hasSubscribers() {
                return false;
            }
        },
        trace: undefined
    });
}

const cases: readonly BuilderCase[] = [
    {
        name: 'annotated async factories return promises',
        dependency: '/* @__NO_SIDE_EFFECTS__ */ export async function make() { return { method() { return {}; } }; }',
        computeBody: 'return 1;',
        program: 'const unused = make().method(compute());',
        removesComputation: false
    },
    {
        name: 'annotated generators return iterators',
        dependency: '/* @__NO_SIDE_EFFECTS__ */ export function* make() { return { method() { return {}; } }; }',
        computeBody: 'return 1;',
        program: 'const unused = make().method(compute());',
        removesComputation: false
    },
    {
        name: 'direct eval replaces an imported method',
        dependency: 'export const make = { method() { return {}; } };',
        computeBody: 'return 1;',
        program: 'eval("make.method = () => console.log(42)"); const unused = make.method();',
        removesComputation: false
    },
    {
        name: 'provider eval replaces an exported function',
        dependency: 'export let make = () => ({}); eval("make = () => console.log(42)");',
        computeBody: 'return 1;',
        program: 'const unused = make();',
        removesComputation: false
    },
    {
        name: 'replaced imported method',
        dependency: 'export const make = { method() { return {}; } };',
        computeBody: 'return 1;',
        program: 'make.method = () => console.log("effect"); const unused = make.method();',
        removesComputation: false
    },
    {
        name: 'imported method replaced through an alias',
        dependency: 'export const make = { method() { return {}; } };',
        computeBody: 'return 1;',
        program: 'const alias = make; alias.method = () => console.log("effect"); const unused = make.method();',
        removesComputation: false
    },
    {
        name: 'provider replaces its exported function',
        dependency: 'export let make = () => ({}); make = () => console.log("effect");',
        computeBody: 'return 1;',
        program: 'const unused = make();',
        removesComputation: false
    },
    {
        name: 'provider replaces its exported method',
        dependency: 'export const make = { method() { return {}; } }; make.method = () => console.log("effect");',
        computeBody: 'return 1;',
        program: 'const unused = make.method();',
        removesComputation: false
    },
    {
        name: 'receiver method changes another method',
        dependency:
            'export const make = { method() { return {}; }, replace() { this.method = () => console.log("effect"); } };',
        computeBody: 'return 1;',
        program: 'make.replace(); const unused = make.method();',
        removesComputation: false
    },
    {
        name: 'imported object escapes to an unknown call',
        dependency: 'export const make = { method() { return {}; } };',
        computeBody: 'return 1;',
        program:
            'function replace(object) { object.method = () => console.log("effect"); } replace(make); const unused = make.method();',
        removesComputation: false
    },
    {
        name: 'parameter stored in a returned object',
        dependency: 'export function make(value) { return { value }; }',
        computeBody: 'return 1;',
        program: 'const unused = { ...make(compute()) };',
        removesComputation: true
    },
    {
        name: 'identity factory',
        dependency: 'export function make(value) { return value; }',
        computeBody: 'return 1;',
        program: 'const unused = make(compute());',
        removesComputation: true
    },
    {
        name: 'pure factory and module initialization',
        dependency: 'console.log("load"); export function make() { return {}; }',
        computeBody: 'return 1;',
        program: 'const unused = make(compute());',
        removesComputation: true
    },
    {
        name: 'pure returned object spread',
        dependency: 'export function make() { return {}; }',
        computeBody: 'return 1;',
        program: 'const unused = { ...make(compute()) };',
        removesComputation: true
    },
    {
        name: 'pure fluent factory',
        dependency: 'export function make() { return { method() { return {}; } }; }',
        computeBody: 'return 1;',
        program: 'const unused = make().method(compute());',
        removesComputation: true
    },
    {
        name: 'returned initializer effects',
        dependency: 'export function make() { return { value: console.log("effect") }; }',
        computeBody: 'return 1;',
        program: 'const unused = make(compute());',
        removesComputation: false
    },
    {
        name: 'parameter default effects',
        dependency: 'export function make(value = console.log("effect")) { return {}; }',
        computeBody: 'return;',
        program: 'const unused = make(compute());',
        removesComputation: false
    },
    {
        name: 'parameter destructuring exceptions',
        dependency: 'export function make({ value }) { return {}; }',
        computeBody: 'return null;',
        program: 'const unused = make(compute());',
        removesComputation: false
    },
    {
        name: 'returned getter effects',
        dependency:
            'export function make() { return { get value() { console.log("get"); return 1; }, method() { return {}; } }; }',
        computeBody: 'return 1;',
        program: 'const unused = { ...make(compute()) };',
        removesComputation: false
    },
    {
        name: 'async return assimilation',
        dependency: 'export async function make() { return { get then() { console.log("then"); } }; }',
        computeBody: 'return 1;',
        program: 'const unused = make(compute());',
        removesComputation: false
    },
    {
        name: 'function properties versus returned object properties',
        dependency: 'export const make = () => ({ method() { return {}; } });',
        computeBody: 'return 1;',
        program: 'const unused = make.method(compute());',
        removesComputation: false
    },
    {
        name: 'dotted names versus nested properties',
        dependency: 'export const make = { "method.deep"() { return {}; } };',
        computeBody: 'return 1;',
        program: 'const unused = make.method.deep(compute());',
        removesComputation: false
    }
];

suite('external builder runtime safety', function () {
    for (const fixture of cases) {
        test(fixture.name, async function () {
            const bundle = bundleForCodeFile({
                name: 'package',
                inputFilePath: '/repo/build/index.js',
                targetFilePath: 'index.js',
                content: `import { make } from "schema-lib"; function compute() { ${fixture.computeBody} }
                    ${fixture.program} export const value = 42; export function probe() { return value; }`
            });
            const dependency = bundleForCodeFile({
                name: 'schema-lib',
                inputFilePath: '/repo/node_modules/schema-lib/index.js',
                targetFilePath: 'index.js',
                content: fixture.dependency
            });
            const [ output ] = await builderEliminator(fixture.dependency).eliminate(inputs(bundle));
            assertDefined(output);
            await assertDeadCodeEliminationBehaviorEquivalent({
                name: fixture.name,
                entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
                leftName: 'original',
                leftBundles: [ bundle, dependency ],
                rightName: 'eliminated',
                rightBundles: [ output, dependency ]
            });
            if (fixture.removesComputation) {
                const content = output.contents[0]?.fileDescription.content;
                assertDefined(content);
                const project = createProject({ withFiles: [ { filePath: 'index.js', content } ] });
                assert.strictEqual(
                    project.getSourceFileOrThrow('index.js').getDescendantsOfKind(SyntaxKind.CallExpression).length,
                    0
                );
            }
        });
    }
});

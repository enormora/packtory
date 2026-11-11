import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { assertDeepSubset, assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import {
    assertDeadCodeEliminationEquivalent,
    assertDeadCodeEliminationBehaviorEquivalent,
    observeDeadCodeEliminationBehavior,
    eliminateDeadCodeAndAssertAllOutputValid,
    type DeadCodeEliminationOracleCase
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

type LocalValueCase = {
    readonly name: string;
    readonly entry: string;
    readonly modules: Readonly<Record<string, string>>;
    readonly remainingCalls: number;
};

function recursionEntry(statement: string, value: string): string {
    return `${statement}function fib(n){return n<2?n:fib(n-1)+fib(n-2);}` +
        `export const value=fib(${value});export function probe(){return value;}`;
}

function localValueFixture(input: Pick<LocalValueCase, 'entry' | 'modules' | 'name'>): DeadCodeEliminationOracleCase {
    const bundle = bundleForCodeFile({
        name: 'package',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content: input.entry,
        extraResources: Object.entries(input.modules).map(function ([ targetFilePath, content ]) {
            return {
                ...bundleResource(`/source/${targetFilePath}`, { content, targetFilePath }),
                isSubstituted: false
            };
        })
    });
    return {
        name: input.name,
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
        eliminationInputs: inputs({
            ...bundle,
            contents: bundle.contents.map(function (resource) {
                return {
                    ...resource,
                    directDependencies: new Set(resource.moduleReferences.flatMap(function (reference) {
                        return reference.type === 'local-code' ? [ reference.targetFilePath ] : [];
                    }))
                };
            })
        })
    };
}

const namedEntry = recursionEntry('import {count} from "./dependency.js";', 'count');
const lazyEntry =
    'export async function probe(){try{const module=await import("./consumer.js");return module.value;}catch(error){return error.name+":"+error.message.includes("count");}}';
const cases: readonly LocalValueCase[] = [
    {
        name: 'named constant',
        entry: namedEntry,
        modules: { 'dependency.js': 'export const count=10;' },
        remainingCalls: 0
    },
    {
        name: 'namespace member',
        entry: recursionEntry('import * as values from "./dependency.js";', 'values.count'),
        modules: { 'dependency.js': 'export const count=10;' },
        remainingCalls: 0
    },
    {
        name: 'forwarded constant',
        entry: namedEntry,
        modules: { 'dependency.js': 'export {count} from "./leaf.js";', 'leaf.js': 'export const count=10;' },
        remainingCalls: 0
    },
    {
        name: 'star export',
        entry: namedEntry,
        modules: { 'dependency.js': 'export * from "./leaf.js";', 'leaf.js': 'export const count=10;' },
        remainingCalls: 0
    },
    {
        name: 'default snapshot',
        entry: recursionEntry('import count from "./dependency.js";', 'count'),
        modules: { 'dependency.js': 'const count=10;export default count;' },
        remainingCalls: 0
    },
    {
        name: 'forwarded namespace snapshot',
        entry: recursionEntry('import {wrapped} from "./dependency.js";', 'wrapped.count'),
        modules: {
            'dependency.js': 'export {default as wrapped} from "./wrapper.js";',
            'wrapper.js': 'import * as values from "./leaf.js";export default values;',
            'leaf.js': 'export const count=10;'
        },
        remainingCalls: 0
    },
    {
        name: 'derived constant fixed point',
        entry: namedEntry,
        modules: {
            'dependency.js': 'import {base} from "./leaf.js";const count=base*2;export {count};',
            'leaf.js': 'export const base=5;'
        },
        remainingCalls: 0
    },
    {
        name: 'constant computed from a captured module binding',
        entry: namedEntry,
        modules: {
            'dependency.js': 'const factor=6;function compute(n){return n*factor;}export const count=compute(5);'
        },
        remainingCalls: 0
    },
    {
        name: 'mutable export',
        entry:
            'import {count,set} from "./dependency.js";function fib(n){return n<2?n:fib(n-1)+fib(n-2);}export function probe(){set(11);return fib(count);}',
        modules: { 'dependency.js': 'export let count=10;export function set(value){count=value;}' },
        remainingCalls: 3
    },
    {
        name: 'ordinary object property',
        entry: recursionEntry('import {values} from "./dependency.js";values.count=11;', 'values.count'),
        modules: { 'dependency.js': 'export const values={count:10};' },
        remainingCalls: 3
    },
    {
        name: 'initialization effects remain unproved',
        entry: namedEntry,
        modules: { 'dependency.js': 'console.log("initialization");export const count=10;' },
        remainingCalls: 3
    }
];

const failures = [
    {
        name: 'captured module constant read by a cyclic initialization callback',
        entry: 'import "./consumer.js";export {value} from "./consumer.js";export function probe(){return 42;}',
        modules: {
            'consumer.js': 'import "./initializer.js";const factor=2;' +
                'export function compute(){return factor;}export const value=compute();',
            'initializer.js': 'import {compute} from "./consumer.js";compute();'
        },
        native: { error: { name: 'ReferenceError' } }
    },
    {
        name: 'consumer invoked before its separate constant dependency initializes',
        entry: lazyEntry,
        modules: {
            'consumer.js': 'import "./initializer.js";import {count} from "./constants.js";' +
                'export function read(){return count;}export const value=count;',
            'initializer.js': 'import {read} from "./consumer.js";read();',
            'constants.js': 'export const count=10;'
        },
        native: { error: null, value: 'ReferenceError:true' }
    },
    {
        name: 'cyclic initialization',
        entry: 'import "./dependency.js";export {probe} from "./consumer.js";',
        modules: {
            'dependency.js': 'import "./consumer.js";export const count=10;',
            'consumer.js': `${namedEntry}export const early=probe();`
        },
        native: { error: { name: 'ReferenceError' } }
    },
    {
        name: 'ambiguous star exports',
        entry: lazyEntry,
        modules: {
            'consumer.js': namedEntry,
            'dependency.js': 'export * from "./a.js";export * from "./b.js";',
            'a.js': 'export const count=10;',
            'b.js': 'export const count=10;'
        },
        native: { error: null, value: 'SyntaxError:true' }
    },
    {
        name: 'missing import in a dependency',
        entry: lazyEntry,
        modules: {
            'consumer.js': namedEntry,
            'dependency.js': 'import {count} from "./empty.js";export const other=10;',
            'empty.js': 'export {};'
        },
        native: { error: null, value: 'SyntaxError:true' }
    }
];

suite('local module value propagation', function () {
    for (const input of cases) {
        test(input.name, async function () {
            const fixture = localValueFixture(input);
            await assertDeadCodeEliminationEquivalent(fixture);
            const [ output ] = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            assertDefined(output);
            const calls = output.contents.flatMap(function (resource) {
                return createProject()
                    .createSourceFile('output.js', resource.fileDescription.content)
                    .getDescendantsOfKind(SyntaxKind.CallExpression)
                    .filter(function (call) {
                        return call.getExpression().getText() === 'fib';
                    });
            });
            assert.strictEqual(calls.length, input.remainingCalls);
        });
    }
    for (const input of failures) {
        test(`preserves ${input.name}`, async function () {
            const fixture = localValueFixture(input);
            const original = fixture.eliminationInputs.map(function (entry) {
                return entry.bundle;
            });
            const emitted = await createTestEliminator().eliminate(fixture.eliminationInputs);
            const native = await observeDeadCodeEliminationBehavior({
                name: input.name,
                entry: fixture.entry,
                bundles: original
            });
            assertDeepSubset(native[0]?.result.observation, input.native);
            await assertDeadCodeEliminationBehaviorEquivalent({
                name: input.name,
                entry: fixture.entry,
                leftName: 'original',
                leftBundles: original,
                rightName: 'emitted',
                rightBundles: emitted
            });
        });
    }
});

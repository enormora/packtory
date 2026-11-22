import assert from 'node:assert';
import { GenMapping, addSegment, toEncodedMap } from '@jridgewell/gen-mapping';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { suite, test } from 'mocha';
import { ts } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { moduleEliminationInputs } from '../test-libraries/eliminator-test-support.ts';
import {
    eliminateDeadCodeAndAssertAllOutputValid,
    type DeadCodeEliminationCase
} from '../test-libraries/dead-code-elimination-output-assertions.ts';
import { assertModuleEliminationOutput } from '../test-libraries/dead-code-elimination-module-case.ts';
import { createProject } from '../test-libraries/typescript-project.ts';

const cases = [
    {
        name: 'a second dependency retains its initialization effects',
        content: 'import "./empty.js";import "./effect.js";export function probe(){return 42;}',
        modules: { 'empty.js': 'export {};', 'effect.js': 'console.log("initialize");export {};' },
        retained: [ 'effect.js', 'index.js' ]
    },
    {
        name: 'observed namespace forwarding remains',
        content: 'import {ns} from "./barrel.js";export function probe(){return Object.keys(ns);}',
        modules: { 'barrel.js': 'export * as ns from "./dep.js";', 'dep.js': 'export {};' },
        retained: [ 'barrel.js', 'dep.js', 'index.js' ]
    },
    {
        name: 'empty statements in a dependency',
        content: 'import "./dep.js";export function probe(){return 42;}',
        modules: { 'dep.js': ';export {};;' },
        retained: [ 'index.js' ]
    },
    {
        name: 'folded constant',
        content: 'import {value} from "./dep.js";export function probe(){return value*2;}',
        modules: { 'dep.js': 'export const value=21;' },
        retained: [ 'index.js' ]
    },
    {
        name: 'empty forwarding chain',
        content: 'import {value} from "./barrel.js";export function probe(){return value*2;}',
        modules: {
            'barrel.js': 'export {value} from "./dep.js";',
            'dep.js': 'export const value=21;'
        },
        retained: [ 'index.js' ]
    },
    {
        name: 'dependency initialization effect',
        content: 'import {value} from "./dep.js";export function probe(){return value*2;}',
        modules: { 'dep.js': 'console.log("initialize");export const value=21;' },
        retained: [ 'dep.js', 'index.js' ]
    },
    {
        name: 'forwarding chain preserves dependency effects',
        content: 'import {value} from "./barrel.js";export function probe(){return value*2;}',
        modules: {
            'barrel.js': 'export {value} from "./dep.js";',
            'dep.js': 'console.log("initialize");export const value=21;'
        },
        retained: [ 'barrel.js', 'dep.js', 'index.js' ]
    },
    {
        name: 'module scope after removing the last import',
        content: 'import "./wrapper.js";export function probe(){return 42;}',
        modules: {
            'wrapper.js': 'import "./dep.js";console.log(this===undefined);',
            'dep.js': 'export {};'
        },
        retained: [ 'index.js', 'wrapper.js' ]
    },
    {
        name: 'import attribute exception',
        content: 'import "./dep.js" with {type:"json"};export function probe(){return 42;}',
        modules: { 'dep.js': 'export {};' },
        retained: [ 'dep.js', 'index.js' ]
    },
    {
        name: 'invalid empty dependency still throws',
        content: 'import "./dep.js";export function probe(){return 42;}',
        modules: { 'dep.js': 'export type {};' },
        retained: [ 'dep.js', 'index.js' ]
    },
    {
        name: 'dynamic import remains observable',
        content: 'export async function probe(){return Object.keys(await import("./dep.js"));}',
        modules: { 'dep.js': 'export {};' },
        retained: [ 'dep.js', 'index.js' ]
    },
    {
        name: 'observed empty namespace',
        content: 'import * as ns from "./dep.js";export function probe(){return Object.keys(ns);}',
        modules: { 'dep.js': 'export {};' },
        retained: [ 'dep.js', 'index.js' ]
    }
];

function mappedEmptyImportCase(): DeadCodeEliminationCase {
    const content =
        'import "./dep.js";export function probe(input){console.log("entry");return input;}\n//# sourceMappingURL=index.js.map';
    const mapping = new GenMapping({ file: 'index.js' });
    addSegment(mapping, 0, 0, 'original.ts', 10, 0);
    addSegment(mapping, 0, content.indexOf('console'), 'original.ts', 10, 5);
    return {
        name: 'empty link source map',
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
        eliminationInputs: moduleEliminationInputs(content, {
            'dep.js': 'export {};',
            'index.js.map': JSON.stringify(toEncodedMap(mapping))
        })
    };
}

suite('empty module links', function () {
    test('preserves empty imports when transformations are disabled', async function () {
        const content = 'import "./dep.js";export function probe(){return 42;}';
        const [ result ] = await eliminateDeadCodeAndAssertAllOutputValid({
            name: 'disabled empty link pruning',
            entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
            eliminationInputs: moduleEliminationInputs(content, { 'dep.js': 'export {};' }).map(function (input) {
                return { ...input, transformationsEnabled: false };
            })
        });
        assertDefined(result);
        assert.deepStrictEqual(
            new Set(result.contents.map(function (resource) {
                return resource.fileDescription.targetFilePath;
            })),
            new Set([ 'index.js', 'dep.js' ])
        );
        assert.strictEqual(
            result
                .contents
                .find(function (resource) {
                    return resource.fileDescription.targetFilePath === 'index.js';
                })
                ?.fileDescription
                .content,
            content
        );
    });
    for (const fixture of cases) {
        test(`preserves ${fixture.name}`, async function () {
            const modules = await assertModuleEliminationOutput(fixture.name, fixture.content, fixture.modules);
            assert.deepStrictEqual(new Set(modules.keys()), new Set(fixture.retained));
            const project = createProject();
            for (const [ path, content ] of modules) {
                assert.strictEqual(ts.isExternalModule(project.createSourceFile(path, content).compilerNode), true);
            }
        });
    }

    test('recomposes source-map columns after deleting an import on the same line', async function () {
        const [ result ] = await eliminateDeadCodeAndAssertAllOutputValid(mappedEmptyImportCase());
        assertDefined(result);
        const output = result.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'index.js';
        });
        const map = result.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'index.js.map';
        });
        assertDefined(output);
        assertDefined(map);
        assert.strictEqual(output.fileDescription.content.includes('import'), false);
        const position = originalPositionFor(new TraceMap(map.fileDescription.content), {
            line: 1,
            column: output.fileDescription.content.indexOf('console')
        });
        assert.partialDeepStrictEqual(position, { line: 11, column: 5 });
    });
});

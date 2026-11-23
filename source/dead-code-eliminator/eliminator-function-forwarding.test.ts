import assert from 'node:assert';
import { suite, test } from 'mocha';
import { eliminateDeadCodeAndAssertAllOutputValid } from '../test-libraries/dead-code-elimination-output-assertions.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { moduleEliminationInputs } from '../test-libraries/eliminator-test-support.ts';

const modules = {
    'barrel.js': 'export {read} from "./lib/read.js";',
    'lib/read.js': 'export function read(value){return value*2;}'
};

suite('function forwarding', function () {
    for (
        const { name, content, files, retained } of [
            {
                name: 'redirects a named re-export and folds a fixed call',
                content: 'export {read as twice} from "./barrel.js";import {read} from "./barrel.js";' +
                    'export function probe(){return read(21);}',
                files: modules,
                retained: [ 'index.js', 'lib/read.js' ]
            },
            {
                name: 'redirects an aliased import with a runtime argument',
                content: 'import {read as twice} from "./barrel.js";export function probe(value){return twice(value);}',
                files: modules,
                retained: [ 'index.js', 'lib/read.js' ]
            },
            {
                name: 'preserves a namespace view of the wrapper',
                content: 'import * as ns from "./barrel.js";export function probe(){return Object.keys(ns);}',
                files: modules,
                retained: [ 'barrel.js', 'index.js', 'lib/read.js' ]
            },
            {
                name: 'preserves initialization order through a wrapper',
                content: 'export {read} from "./barrel.js";export function probe(){return 42;}',
                files: {
                    ...modules,
                    'lib/read.js': 'await Promise.resolve();export function read(value){return value*2;}'
                },
                retained: [ 'barrel.js', 'index.js', 'lib/read.js' ]
            }
        ]
    ) {
        test(name, async function () {
            const [ result ] = await eliminateDeadCodeAndAssertAllOutputValid({
                name,
                entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
                eliminationInputs: moduleEliminationInputs(content, files)
            });
            assertDefined(result);
            assert.deepStrictEqual(
                result
                    .contents
                    .map(function (resource) {
                        return resource.fileDescription.targetFilePath;
                    })
                    .toSorted(function (left, right) {
                        return left.localeCompare(right);
                    }),
                retained
            );
            const entry = result.contents.find(function (resource) {
                return resource.fileDescription.targetFilePath === 'index.js';
            });
            assertDefined(entry);
            const dependency = retained.includes('barrel.js') ? 'barrel.js' : 'lib/read.js';
            assert.deepStrictEqual(entry.directDependencies, new Set([ dependency ]));
            if (name.includes('fixed call')) {
                assert.match(entry.fileDescription.content, /return \(?42\)?;/u);
            }
        });
    }
});

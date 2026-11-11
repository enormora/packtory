import assert from 'node:assert';
import { suite, test } from 'mocha';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { createDeadCodeEliminationTraceCollector } from '../../test-libraries/dead-code-elimination-trace-fixtures.ts';
import { createExportGraph } from '../exports/export-graph.ts';
import { buildDeclarationNodeIndex } from './binding-identifier.ts';
import { gatherLocalSeeds } from './local-seed-gathering.ts';

suite('local retention seeds', function () {
    test('retains bindings needed by an effect statement', function () {
        const files = multiFileBindingsFor([ {
            filePath: '/source/index.js',
            content: 'const value=42;console.log(value);'
        } ]);
        const trace = createDeadCodeEliminationTraceCollector();
        const seeds = gatherLocalSeeds({
            files,
            entryPointFilePaths: new Set(),
            declarationIndex: buildDeclarationNodeIndex(files),
            classifySideEffects,
            deadCodeElimination: undefined,
            bundleName: 'example',
            trace: { collector: trace.collector }
        }, undefined);
        assert.deepStrictEqual(seeds, new Set([ '/source/index.js::value' ]));
        assert.deepStrictEqual(trace.events, [ {
            type: 'local-seed-added',
            bundleName: 'example',
            bindingIdentifier: '/source/index.js::value',
            inputFilePath: '/source/index.js',
            line: 1,
            reason: 'impure-statement'
        } ]);
    });

    for (
        const [ content, expected, reason ] of [
            [ 'export {value} from "./library.js";', '/source/library.js::value', 'entry-export-declaration' ],
            [
                'import {missing} from "./library.js";export const result=42;',
                '/source/index.js::missing',
                'module-evaluation'
            ]
        ] as const
    ) {
        test(`explains retained binding dependencies for ${content}`, function () {
            const files = multiFileBindingsFor([
                { filePath: '/source/index.js', content },
                { filePath: '/source/library.js', content: 'export const value=42;' }
            ]);
            const publicPaths = new Set([ '/source/index.js' ]);
            const trace = createDeadCodeEliminationTraceCollector();
            const graph = createExportGraph({
                files,
                publicPaths,
                classifySideEffects,
                settings: undefined,
                observedBindings: undefined
            });
            const seeds = gatherLocalSeeds({
                files,
                entryPointFilePaths: publicPaths,
                declarationIndex: buildDeclarationNodeIndex(files),
                classifySideEffects,
                deadCodeElimination: undefined,
                bundleName: 'example',
                trace: { collector: trace.collector }
            }, graph);
            assert.strictEqual(seeds.has(expected), true);
            assert.deepStrictEqual(
                trace.events.filter(function (event) {
                    return event.type === 'local-seed-added' && event.bindingIdentifier === expected;
                }),
                [ {
                    type: 'local-seed-added',
                    bundleName: 'example',
                    bindingIdentifier: expected,
                    inputFilePath: '/source/index.js',
                    line: 1,
                    reason
                } ]
            );
            assert.strictEqual(
                trace.events.some(function (event) {
                    return event.type === 'local-seed-added' && event.bindingIdentifier.includes('::@');
                }),
                false
            );
        });
    }
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fileBindingsFor, multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { bindingValueIsStable } from '../binding-stability.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { createModuleGraphAnalysis } from './module-graph-analysis.ts';

suite('module graph analysis', function () {
    test('caches side-effect classification and ignores sources outside the graph', function () {
        const file = fileBindingsFor('/source/index.js', 'consume();');
        let classifications = 0;
        const graph = createModuleGraphAnalysis({
            files: [ file ],
            publicPaths: new Set(),
            settings: undefined,
            observedBindings: undefined,
            classifySideEffects() {
                classifications += 1;
                return [];
            }
        }, bindingValueIsStable);
        const source = file.sourceFile.getSourceFile();
        const effects = graph.effects(source);
        assert.strictEqual(graph.effects(source), effects);
        assert.strictEqual(classifications, 1);
        const outside = createProject().createSourceFile('outside.ts', 'export const value=1;');
        assert.strictEqual(graph.resolveModule(outside, './index.js'), undefined);
    });

    suite('module graph public boundaries', function () {
        for (const publicEntry of [ true, false ]) {
            test(`resolves linked namespaces with public entry ${String(publicEntry)}`, function () {
                const [ entry, library ] = multiFileBindingsFor([
                    { filePath: 'index.js', content: 'import * as ns from "./library.js";export {ns};' },
                    { filePath: 'library.js', content: 'export const value=42;' }
                ]);
                assertDefined(entry);
                assertDefined(library);
                const graph = createModuleGraphAnalysis({
                    files: [ entry, library ],
                    publicPaths: new Set(publicEntry ? [ 'index.js' ] : []),
                    settings: undefined,
                    observedBindings: undefined,
                    classifySideEffects
                }, bindingValueIsStable);
                assert.strictEqual(
                    graph.resolveModule(entry.sourceFile.getSourceFile(), './library.js'),
                    library.sourceFile
                );
                assert.strictEqual(graph.resolveModule(entry.sourceFile.getSourceFile(), './missing.js'), undefined);
                assert.deepStrictEqual(
                    graph.demand.exportProperties(entry.sourceFile.getSourceFile(), 'ns'),
                    publicEntry ? undefined : new Set()
                );
            });
        }
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { bindingValueIsStable } from '../binding-stability.ts';
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
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { createExportGraph } from './export-graph.ts';

suite('unknown dynamic import targets', function () {
    test('retains every runtime module export', function () {
        const files = multiFileBindingsFor([
            { filePath: 'index.js', content: 'export function probe(path){return import(path);}' },
            { filePath: 'library.js', content: 'export const value=42;' }
        ]);
        const entry = files[0];
        assertDefined(entry);
        const graph = createExportGraph({
            files,
            publicPaths: new Set([ 'index.js' ]),
            classifySideEffects,
            observedBindings: undefined
        });
        const expected = new Set(graph.externalTargets(new Set([ 'index.js::probe', 'library.js::value' ])));
        assert.strictEqual(expected.size, 4);
        assert.deepStrictEqual(
            new Set(graph.dynamicTargets(entry.sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression))),
            expected
        );
    });
});

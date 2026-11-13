import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    applySourceTextEdits,
    toSourceMapTransform,
    type SourceMapTransform
} from '../source-transformation/text-edits.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { eliminationInputIdentity } from './elimination-input-identity.ts';

function analysisIdentity(target: string, transforms: readonly SourceMapTransform[], entryName: string): string | null {
    const bundle = bundleForCodeFile({
        name: 'package',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content: 'export const value = 42;'
    });
    return eliminationInputIdentity(inputs({
        ...bundle,
        roots: Object.fromEntries(
            Object.values(bundle.roots).map(function (root) {
                return [ entryName, root ];
            })
        ),
        sourceMapTransformsByTargetPath: new Map([ [ target, transforms ] ])
    }));
}

suite('elimination input identity', function () {
    test('distinguishes source map targets and mappings when source code is unchanged', function () {
        const transform = toSourceMapTransform(applySourceTextEdits('export const value = 42;', []));
        const changed = toSourceMapTransform(applySourceTextEdits('\nexport const value = 42;', [
            { start: 0, end: 1, content: '' }
        ]));
        const identity = analysisIdentity('index.js', [ transform ], 'main');
        assert.notStrictEqual(identity, null);
        assert.notStrictEqual(analysisIdentity('other.js', [ transform ], 'main'), identity);
        assert.notStrictEqual(analysisIdentity('index.js', [ changed ], 'main'), identity);
        assert.notStrictEqual(analysisIdentity('index.js', [], 'main'), identity);
        assert.notStrictEqual(analysisIdentity('index.js', [ transform ], 'other'), identity);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    applySourceTextEdits,
    toSourceMapTransform,
    type SourceMapTransform
} from '../source-transformation/text-edits.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
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
    test('preserves cloned identities and distinguishes edited source contents', function () {
        const original = inputs(bundleForCodeFile({
            name: 'package',
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js',
            content: 'export const value=42;'
        }));
        const identity = eliminationInputIdentity(original);
        assert.notStrictEqual(identity, null);
        const changed = structuredClone(original);
        assert.strictEqual(eliminationInputIdentity(changed), identity);
        const resource = changed[0]?.bundle.contents[0];
        assertDefined(resource);
        Object.assign(resource.fileDescription, { content: 'export const value=43;' });
        assert.notStrictEqual(eliminationInputIdentity(changed), identity);
    });

    test('rejects nonserializable input metadata', function () {
        const original = inputs(bundleForCodeFile({
            name: 'package',
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js',
            content: 'export const value=42;'
        }));
        const input = original[0];
        assertDefined(input);
        Object.assign(input.bundle, {
            describe() {
                return 'metadata';
            }
        });
        assert.strictEqual(eliminationInputIdentity(original), null);
    });

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

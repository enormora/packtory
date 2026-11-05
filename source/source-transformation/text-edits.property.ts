import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { buildTextTransformMap } from './text-edits.ts';

suite('source text transformations', function () {
    test('reconstructs edited text and maps every retained range to identical source text', function () {
        fastCheck.assert(fastCheck.property(fastCheck.string(), fastCheck.string(), function (original, expected) {
            const transformed = buildTextTransformMap(original, expected);
            assert.strictEqual(transformed.transformedCode, expected);
            for (const range of transformed.atoms) {
                assert.strictEqual(
                    expected.slice(range.newStart, range.newStart + range.originalEnd - range.originalStart),
                    original.slice(range.originalStart, range.originalEnd)
                );
            }
        }));
    });
});

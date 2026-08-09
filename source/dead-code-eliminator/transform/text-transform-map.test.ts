import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildTextTransformMap } from './atom-translator.ts';

suite('text-transform-map', function () {
    test('maps unchanged text after a deletion to its new offset', function () {
        const map = buildTextTransformMap('red blue green', 'red green');

        assert.deepStrictEqual(map.atoms, [
            { originalStart: 0, originalEnd: 4, newStart: 0 },
            { originalStart: 9, originalEnd: 14, newStart: 4 }
        ]);
    });

    test('does not map inserted text', function () {
        const map = buildTextTransformMap('red green', 'red blue green');

        assert.deepStrictEqual(map.atoms, [
            { originalStart: 0, originalEnd: 4, newStart: 0 },
            { originalStart: 4, originalEnd: 9, newStart: 9 }
        ]);
    });
});

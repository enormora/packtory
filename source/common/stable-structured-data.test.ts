import assert from 'node:assert';
import { suite, test } from 'mocha';
import { serializeStableJavaScriptObjectNotation } from './stable-structured-data.ts';

suite('stable-json', function () {
    test('serializes with 4-space indentation', function () {
        const result = serializeStableJavaScriptObjectNotation({ a: 'foo' });
        assert.strictEqual(result, '{\n    "a": "foo"\n}');
    });

    test('sorts top-level object keys alphabetically by default', function () {
        const result = serializeStableJavaScriptObjectNotation({ b: 'foo', a: 'bar' });
        assert.strictEqual(result, '{\n    "a": "bar",\n    "b": "foo"\n}');
    });

    test('sorts nested object keys alphabetically', function () {
        const result = serializeStableJavaScriptObjectNotation({ outer: { b: 2, a: 1 } });
        assert.strictEqual(
            result,
            [ '{', '    "outer": {', '        "a": 1,', '        "b": 2', '    }', '}' ].join('\n')
        );
    });

    test('sorts primitive arrays', function () {
        const result = serializeStableJavaScriptObjectNotation({ values: [ 'b', 'a' ] });
        assert.strictEqual(result, '{\n    "values": [\n        "a",\n        "b"\n    ]\n}');
    });

    test('preserves order of arrays whose path the predicate matches', function () {
        const result = serializeStableJavaScriptObjectNotation(
            { keepOrdered: [ 'z', 'a' ], reorder: [ 'z', 'a' ] },
            {
                shouldPreserveArrayOrder(path) {
                    return path[0] === 'keepOrdered';
                }
            }
        );
        assert.strictEqual(
            result,
            [
                '{',
                '    "keepOrdered": [',
                '        "z",',
                '        "a"',
                '    ],',
                '    "reorder": [',
                '        "a",',
                '        "z"',
                '    ]',
                '}'
            ]
                .join('\n')
        );
    });

    test('produces byte-identical output for inputs that differ only in key order', function () {
        const first = serializeStableJavaScriptObjectNotation({ b: 1, a: { d: 4, c: 3 } });
        const second = serializeStableJavaScriptObjectNotation({ a: { c: 3, d: 4 }, b: 1 });
        assert.strictEqual(first, second);
    });

    test('throws when given a circular record', function () {
        const inner: Record<string, unknown> = {};
        const outer: Record<string, unknown> = { inner };
        inner.outer = outer;

        try {
            serializeStableJavaScriptObjectNotation(outer);
            assert.fail('Expected serializeStableJavaScriptObjectNotation() to throw');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Circular structures are not supported');
        }
    });

    test('throws when given a circular array', function () {
        const circular: unknown[] = [];
        circular.push(circular);

        try {
            serializeStableJavaScriptObjectNotation({ values: circular });
            assert.fail('Expected serializeStableJavaScriptObjectNotation() to throw');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Circular structures are not supported');
        }
    });
});

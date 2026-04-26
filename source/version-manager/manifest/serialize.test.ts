import assert from 'node:assert';
import { test } from 'mocha';
import type { JsonValue } from 'type-fest';
import { serializePackageJson } from './serialize.ts';

test('serializes the given data with 4 spaces indentation', () => {
    const result = serializePackageJson({ a: 'foo', b: 'bar' });
    assert.strictEqual(result, '{\n    "a": "foo",\n    "b": "bar"\n}');
});

test('serializes arrays correctly', () => {
    const result = serializePackageJson({ foo: ['a', 'b'] });
    assert.strictEqual(result, '{\n    "foo": [\n        "a",\n        "b"\n    ]\n}');
});

test('sorts the top-level keys alphabetically', () => {
    const result = serializePackageJson({ b: 'foo', a: 'bar' });
    assert.strictEqual(result, '{\n    "a": "bar",\n    "b": "foo"\n}');
});

test('sorts simple array correctly', () => {
    const result = serializePackageJson({ foo: ['b', 'a', 0, true] });
    assert.strictEqual(result, '{\n    "foo": [\n        "a",\n        "b",\n        0,\n        true\n    ]\n}');
});

test('sorts the keys of a top-level property alphabetically', () => {
    const result = serializePackageJson({ b: 'foo', a: { d: 'bar', c: 'baz' } });
    assert.strictEqual(
        result,
        ['{', '    "a": {', '        "c": "baz",', '        "d": "bar"', '    },', '    "b": "foo"', '}'].join('\n')
    );
});

test('sorts the keys of a nested property alphabetically', () => {
    const result = serializePackageJson({ b: 'foo', a: { c: { e: 'bar', d: 'baz' } } });
    assert.strictEqual(
        result,
        [
            '{',
            '    "a": {',
            '        "c": {',
            '            "d": "baz",',
            '            "e": "bar"',
            '        }',
            '    },',
            '    "b": "foo"',
            '}'
        ].join('\n')
    );
});

test('throws when a circular structure is given', () => {
    const secondEntry: JsonValue = {};
    const firstEntry: JsonValue = { c: secondEntry };
    secondEntry.d = firstEntry;

    try {
        serializePackageJson({ b: 'foo', a: firstEntry });
        assert.fail('Expected serializePackageJson() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Circular structures are not supported');
    }
});

test('sorts objects nested within array correctly', () => {
    const result = serializePackageJson({ foo: ['f', { b: '1', a: '2', d: [3, 2] }, 'c'] });
    assert.strictEqual(
        result,
        '{\n    "foo": [\n        "f",\n        {\n            "a": "2",\n            "b": "1",\n            "d": [\n                2,\n                3\n            ]\n        },\n        "c"\n    ]\n}'
    );
});

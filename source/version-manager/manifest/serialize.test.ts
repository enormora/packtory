import assert from 'node:assert';
import { test } from 'mocha';
import type { JsonValue, PackageJson } from 'type-fest';
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

test('sorts primitive array values so false stays before true and numbers stay ordered', () => {
    const result = serializePackageJson({ foo: [true, false, 2, 1] });

    assert.strictEqual(result, '{\n    "foo": [\n        false,\n        true,\n        1,\n        2\n    ]\n}');
});

test('keeps equal primitive values stable without collapsing them', () => {
    const result = serializePackageJson({ foo: ['b', 'a', 'a'] });

    assert.strictEqual(result, '{\n    "foo": [\n        "a",\n        "a",\n        "b"\n    ]\n}');
});

test('sorts descending string arrays into ascending order', () => {
    const result = serializePackageJson({ foo: ['z', 'm', 'a'] });

    assert.strictEqual(result, '{\n    "foo": [\n        "a",\n        "m",\n        "z"\n    ]\n}');
});

test('sorts descending numeric arrays into ascending order', () => {
    const result = serializePackageJson({ foo: [3, 2, 1] });

    assert.strictEqual(result, '{\n    "foo": [\n        1,\n        2,\n        3\n    ]\n}');
});

test('keeps object arrays in original order while sorting each object deeply', () => {
    const result = serializePackageJson({
        foo: [
            { b: 2, a: 1 },
            { d: 4, c: 3 }
        ]
    });

    assert.strictEqual(
        result,
        '{\n    "foo": [\n        {\n            "a": 1,\n            "b": 2\n        },\n        {\n            "c": 3,\n            "d": 4\n        }\n    ]\n}'
    );
});

test('serializes null values inside arrays and nested records without reordering record keys incorrectly', () => {
    const result = serializePackageJson({
        foo: [{ z: null, a: [null, 'b', 'a'] }]
    });

    assert.strictEqual(
        result,
        '{\n    "foo": [\n        {\n            "a": [\n                null,\n                "a",\n                "b"\n            ],\n            "z": null\n        }\n    ]\n}'
    );
});

test('preserves own __proto__ keys while sorting nested objects', () => {
    const result = serializePackageJson(JSON.parse('{ "": [{ "__proto__": {} }] }') as Readonly<PackageJson>);

    assert.strictEqual(result, '{\n    "": [\n        {\n            "__proto__": {}\n        }\n    ]\n}');
});

test('throws for circular arrays as well as circular records', () => {
    const circularArray: JsonValue[] = [];
    circularArray.push(circularArray as unknown as JsonValue);

    assert.throws(() => {
        serializePackageJson({ foo: circularArray });
    }, /^Error: Circular structures are not supported$/);
});

import test from 'ava';
import type { JsonValue } from 'type-fest';
import { serializePackageJson } from './serialize.js';

test('serializes the given data with 4 spaces indentation', (t) => {
    const result = serializePackageJson({ a: 'foo', b: 'bar' });
    t.is(result, '{\n    "a": "foo",\n    "b": "bar"\n}');
});

test('serializes arrays correctly', (t) => {
    const result = serializePackageJson({ foo: ['a', 'b'] });
    t.is(result, '{\n    "foo": [\n        "a",\n        "b"\n    ]\n}');
});

test('sorts the top-level keys alphabetically', (t) => {
    const result = serializePackageJson({ b: 'foo', a: 'bar' });
    t.is(result, '{\n    "a": "bar",\n    "b": "foo"\n}');
});

test('sorts simple array correctly', (t) => {
    const result = serializePackageJson({ foo: ['b', 'a', 0, true] });
    t.is(result, '{\n    "foo": [\n        "a",\n        "b",\n        0,\n        true\n    ]\n}');
});

test('sorts the keys of a top-level property alphabetically', (t) => {
    const result = serializePackageJson({ b: 'foo', a: { d: 'bar', c: 'baz' } });
    t.is(
        result,
        ['{', '    "a": {', '        "c": "baz",', '        "d": "bar"', '    },', '    "b": "foo"', '}'].join('\n')
    );
});

test('sorts the keys of a nested property alphabetically', (t) => {
    const result = serializePackageJson({ b: 'foo', a: { c: { e: 'bar', d: 'baz' } } });
    t.is(
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

test('throws when a circular structure is given', (t) => {
    const secondEntry: JsonValue = {};
    const firstEntry: JsonValue = { c: secondEntry };
    secondEntry.d = firstEntry;

    t.throws(
        () => {
            return serializePackageJson({ b: 'foo', a: firstEntry });
        },
        { message: 'Circular structures are not supported' }
    );
});

test('sorts objects nested within array correctly', (t) => {
    const result = serializePackageJson({ foo: ['f', { b: '1', a: '2', d: [3, 2] }, 'c'] });
    t.is(
        result,
        '{\n    "foo": [\n        "f",\n        {\n            "a": "2",\n            "b": "1",\n            "d": [\n                2,\n                3\n            ]\n        },\n        "c"\n    ]\n}'
    );
});

import test from 'ava';
import { union, string, number, struct, literal, tuple, boolean, optional } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

test('formats correctly for a union of primitives', checkValidationFailure, {
    schema: union(string, number),
    data: true,
    expectedMessages: ['Expected one of string or number; but got boolean']
});

test('formats correctly for a nested union of primitives', checkValidationFailure, {
    schema: struct({ foo: union(string, number) }),
    data: { foo: true },
    expectedMessages: ['At foo: expected one of string or number; but got boolean']
});

test('formats correctly for a union of literals', checkValidationFailure, {
    schema: union(literal('foo'), literal(true), literal(42)),
    data: 21,
    expectedMessages: ['Expected one of "foo", true or 42; but got number']
});

test('formats correctly for a union of primitives in an array', checkValidationFailure, {
    schema: tuple(union(string, number)),
    data: [true],
    expectedMessages: ['At 0: expected one of string or number; but got boolean']
});

test('formats correctly a union of true and false literals', checkValidationFailure, {
    schema: union(literal(true), literal(false)),
    data: 42,
    expectedMessages: ['Expected boolean; but got number']
});

test('formats correctly a union of true and false and more literals', checkValidationFailure, {
    schema: union(literal(true), literal(false), literal('foo')),
    data: 42,
    expectedMessages: ['Expected one of true, false or "foo"; but got number']
});

test('formats correctly a union of true and false literals in any order', checkValidationFailure, {
    schema: union(literal(false), literal(true)),
    data: 42,
    expectedMessages: ['Expected boolean; but got number']
});

test('formats correctly a union of true and false literals determined by their parent union', checkValidationFailure, {
    schema: union(struct({ foo: literal(true) }), struct({ foo: literal(false) })),
    data: { foo: 42 },
    expectedMessages: ['At foo: expected boolean; but got number']
});

test('formats correctly a union of literals determined by their parent union', checkValidationFailure, {
    schema: union(struct({ foo: literal('foo') }), struct({ foo: literal('bar') })),
    data: { foo: 42 },
    expectedMessages: ['At foo: expected one of "foo" or "bar"; but got number']
});

test('formats correctly a union of primitives determined by their parent union', checkValidationFailure, {
    schema: union(struct({ foo: string }), struct({ foo: number })),
    data: { foo: true },
    expectedMessages: ['At foo: expected string; but got boolean', 'At foo: expected number; but got boolean']
});

test('formats correctly a nested union', checkValidationFailure, {
    schema: union(union(literal('foo'), literal('bar')), union(literal(1), literal(2))),
    data: 3,
    expectedMessages: ['Expected one of "foo", "bar", 1 or 2; but got number']
});

test('formats correctly a complex union with multiple discriminators', checkValidationFailure, {
    schema: union(struct({ a: number, b: string, c: boolean }), struct({ a: string, b: number, c: optional(boolean) })),
    data: { b: '', c: true },
    expectedMessages: ['At a: missing key or index', 'At b: expected number; but got string']
});

test('formats correctly a discriminated union with a nested discriminator', checkValidationFailure, {
    schema: union(
        struct({ a: struct({ c: literal(1) }), b: string }),
        struct({ a: struct({ c: literal(2) }), b: number })
    ),
    data: { a: { c: 3 }, b: '' },
    expectedMessages: [
        'At a.c: expected 1; but got number',
        'At b: expected number; but got string',
        'At a.c: expected 2; but got number'
    ]
});

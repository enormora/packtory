import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import type { PackageJson } from 'type-fest';
import { serializePackageJson } from './serialize.ts';

type JsonPrimitive = boolean | number | string | null;
type SortableJsonPrimitive = Exclude<JsonPrimitive, null>;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue; };
type PackageJsonLike = Readonly<Record<string, JsonValue>>;

const primitiveArbitrary = fc.oneof(fc.boolean(), fc.constant(null), fc.integer(), fc.string());

const jsonValueArbitrary = fc
    .letrec(function (tie) {
        return {
            value: fc.oneof(
                primitiveArbitrary,
                fc.array(tie('value'), { maxLength: 5 }),
                fc.dictionary(fc.string(), tie('value'), { maxKeys: 5 })
            )
        };
    })
    .value as fc.Arbitrary<JsonValue>;

const packageJsonLikeArbitrary: fc.Arbitrary<PackageJsonLike> = fc.dictionary(fc.string(), jsonValueArbitrary, {
    maxKeys: 5
});

function compareSortableValues(left: SortableJsonPrimitive, right: SortableJsonPrimitive): number {
    if (left < right) {
        return -1;
    }

    if (left > right) {
        return 1;
    }

    return 0;
}

function isSortablePrimitive(value: JsonValue): value is SortableJsonPrimitive {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function shouldPreserveArrayOrder(path: readonly string[]): boolean {
    const [ topLevelKey ] = path;
    return topLevelKey === 'imports' || topLevelKey === 'exports';
}

function canonicalizeValue(value: JsonValue, path: readonly string[] = []): JsonValue {
    if (Array.isArray(value)) {
        const items: readonly JsonValue[] = value;
        const mapped = items.map(function (item, index) {
            return canonicalizeValue(item, [ ...path, String(index) ]);
        });
        if (shouldPreserveArrayOrder(path)) {
            return mapped;
        }
        return mapped.toSorted(function (left, right) {
            if (isSortablePrimitive(left) && isSortablePrimitive(right)) {
                return compareSortableValues(left, right);
            }

            return 0;
        });
    }

    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
            Object
                .entries(value)
                .toSorted(function ([ keyA ], [ keyB ]) {
                    return compareSortableValues(keyA, keyB);
                })
                .map(function ([ propertyName, propertyValue ]) {
                    return [ propertyName, canonicalizeValue(propertyValue, [ ...path, propertyName ]) ];
                })
        );
    }

    return value;
}

suite('serialize', function () {
    test('serializePackageJson() returns valid JSON with recursively sorted object keys', function () {
        fc.assert(
            fc.property(packageJsonLikeArbitrary, function (value) {
                const result = serializePackageJson(value);
                const parsed = JSON.parse(result) as JsonValue;

                assert.deepStrictEqual(parsed, canonicalizeValue(value));
            })
        );
    });

    test('serializePackageJson() is stable once a package json has been serialized', function () {
        fc.assert(
            fc.property(packageJsonLikeArbitrary, function (value) {
                const serialized = serializePackageJson(value);
                const reparsed = JSON.parse(serialized) as PackageJsonLike;

                assert.strictEqual(serializePackageJson(reparsed as PackageJson), serialized);
            })
        );
    });
});

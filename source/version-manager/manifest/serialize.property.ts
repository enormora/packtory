import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import type { PackageJson } from 'type-fest';
import { serializePackageJson } from './serialize.ts';

type JsonPrimitive = boolean | number | string;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type PackageJsonLike = Readonly<Record<string, JsonValue>>;

const primitiveArbitrary = fc.oneof(fc.boolean(), fc.integer(), fc.string());

const jsonValueArbitrary = fc.letrec((tie) => {
    return {
        value: fc.oneof(
            primitiveArbitrary,
            fc.array(tie('value'), { maxLength: 5 }),
            fc.dictionary(fc.string(), tie('value'), { maxKeys: 5 })
        )
    };
}).value as fc.Arbitrary<JsonValue>;

const packageJsonLikeArbitrary: fc.Arbitrary<PackageJsonLike> = fc.dictionary(fc.string(), jsonValueArbitrary, {
    maxKeys: 5
});

function comparePrimitiveValues(left: JsonPrimitive, right: JsonPrimitive): number {
    if (left < right) {
        return -1;
    }

    if (left > right) {
        return 1;
    }

    return 0;
}

function compareKeys(left: string, right: string): number {
    if (left < right) {
        return -1;
    }

    if (left > right) {
        return 1;
    }

    return 0;
}

function shouldPreserveArrayOrder(path: readonly string[]): boolean {
    const [topLevelKey] = path;
    return topLevelKey === 'imports' || topLevelKey === 'exports';
}

function canonicalizeValue(value: JsonValue, path: readonly string[] = []): JsonValue {
    if (Array.isArray(value)) {
        const mapped = value.map((item, index) => {
            return canonicalizeValue(item, [...path, String(index)]);
        });
        if (shouldPreserveArrayOrder(path)) {
            return mapped;
        }
        return mapped.toSorted((left, right) => {
            if (
                (typeof left === 'string' || typeof left === 'number' || typeof left === 'boolean') &&
                (typeof right === 'string' || typeof right === 'number' || typeof right === 'boolean')
            ) {
                return comparePrimitiveValues(left, right);
            }

            return 0;
        });
    }

    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
            Object.entries(value)
                .toSorted(([keyA], [keyB]) => {
                    return compareKeys(keyA, keyB);
                })
                .map(([propertyName, propertyValue]) => {
                    return [propertyName, canonicalizeValue(propertyValue, [...path, propertyName])];
                })
        );
    }

    return value;
}

suite('serialize', function () {
    test('serializePackageJson() returns valid JSON with recursively sorted object keys', function () {
        fc.assert(
            fc.property(packageJsonLikeArbitrary, (value) => {
                const result = serializePackageJson(value as PackageJson);
                const parsed = JSON.parse(result) as JsonValue;

                assert.deepStrictEqual(parsed, canonicalizeValue(value));
            })
        );
    });

    test('serializePackageJson() is stable once a package json has been serialized', function () {
        fc.assert(
            fc.property(packageJsonLikeArbitrary, (value) => {
                const serialized = serializePackageJson(value as PackageJson);
                const reparsed = JSON.parse(serialized) as PackageJsonLike;

                assert.strictEqual(serializePackageJson(reparsed as PackageJson), serialized);
            })
        );
    });
});

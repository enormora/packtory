import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import type { PackageJson as PackageManifest } from 'type-fest';
import { serializePackageManifest } from './serialize.ts';

type JavaScriptObjectNotationPrimitive = boolean | number | string | null;
type SortableJavaScriptObjectNotationPrimitive = Exclude<JavaScriptObjectNotationPrimitive, null>;
type JavaScriptObjectNotationValue = JavaScriptObjectNotationPrimitive | readonly JavaScriptObjectNotationValue[] | {
    readonly [key: string]: JavaScriptObjectNotationValue;
};
type PackageManifestLike = Readonly<Record<string, JavaScriptObjectNotationValue>>;

const primitiveArbitrary = fastCheck.oneof(
    fastCheck.boolean(),
    fastCheck.constant(null),
    fastCheck.integer(),
    fastCheck.string()
);

const javaScriptObjectNotationValueArbitrary = fastCheck
    .letrec(function (tie) {
        return {
            value: fastCheck.oneof(
                primitiveArbitrary,
                fastCheck.array(tie('value'), { maxLength: 5 }),
                fastCheck.dictionary(fastCheck.string(), tie('value'), { maxKeys: 5 })
            )
        };
    })
    .value as fastCheck.Arbitrary<JavaScriptObjectNotationValue>;

const packageManifestLikeArbitrary: fastCheck.Arbitrary<PackageManifestLike> = fastCheck.dictionary(
    fastCheck.string(),
    javaScriptObjectNotationValueArbitrary,
    {
        maxKeys: 5
    }
);

function compareSortableValues(
    left: SortableJavaScriptObjectNotationPrimitive,
    right: SortableJavaScriptObjectNotationPrimitive
): number {
    if (left < right) {
        return -1;
    }

    if (left > right) {
        return 1;
    }

    return 0;
}

function isSortablePrimitive(value: JavaScriptObjectNotationValue): value is SortableJavaScriptObjectNotationPrimitive {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function shouldPreserveArrayOrder(path: readonly string[]): boolean {
    const [ topLevelKey ] = path;
    return topLevelKey === 'imports' || topLevelKey === 'exports';
}

function canonicalizeValue(
    value: JavaScriptObjectNotationValue,
    path: readonly string[] = []
): JavaScriptObjectNotationValue {
    if (Array.isArray(value)) {
        const items: readonly JavaScriptObjectNotationValue[] = value;
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
    test('serializePackageManifest() returns valid JSON with recursively sorted object keys', function () {
        fastCheck.assert(
            fastCheck.property(packageManifestLikeArbitrary, function (value) {
                const result = serializePackageManifest(value);
                const parsed = JSON.parse(result) as JavaScriptObjectNotationValue;

                assert.deepStrictEqual(parsed, canonicalizeValue(value));
            })
        );
    });

    test('serializePackageManifest() is stable once a package json has been serialized', function () {
        fastCheck.assert(
            fastCheck.property(packageManifestLikeArbitrary, function (value) {
                const serialized = serializePackageManifest(value);
                const reparsed = JSON.parse(serialized) as PackageManifestLike;

                assert.strictEqual(serializePackageManifest(reparsed as PackageManifest), serialized);
            })
        );
    });
});

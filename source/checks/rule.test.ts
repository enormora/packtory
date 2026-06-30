import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    pathAllowListGlobalSchema,
    pathAllowListPerPackageSchema
} from './rule.ts';

type ParseResult<T> = { readonly success: false; } | { readonly success: true; readonly data: T; };
type Schema<T> = {
    readonly safeParse: (input: unknown) => ParseResult<T>;
};

function parseOrFail<T>(schema: Schema<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) {
        assert.fail('expected schema to accept the input');
    }
    return result.data;
}

suite('rule', function () {
    test('enabledOnlyGlobalSchema accepts an object with just an enabled flag', function () {
        assert.deepStrictEqual(parseOrFail(enabledOnlyGlobalSchema, { enabled: true }), { enabled: true });
    });

    test('enabledOnlyGlobalSchema rejects unknown fields in strict mode', function () {
        assert.strictEqual(enabledOnlyGlobalSchema.safeParse({ enabled: true, extra: 1 }).success, false);
    });

    test('emptyPerPackageSchema accepts an empty object', function () {
        assert.deepStrictEqual(parseOrFail(emptyPerPackageSchema, {}), {});
    });

    test('emptyPerPackageSchema rejects any field in strict mode', function () {
        assert.strictEqual(emptyPerPackageSchema.safeParse({ extra: 1 }).success, false);
    });

    test('pathAllowListGlobalSchema accepts enabled with an allow list of non-empty strings', function () {
        assert.deepStrictEqual(parseOrFail(pathAllowListGlobalSchema, { enabled: true, allowList: [ 'a', 'b' ] }), {
            enabled: true,
            allowList: [ 'a', 'b' ]
        });
    });

    test('pathAllowListGlobalSchema rejects an allow list with empty strings', function () {
        assert.strictEqual(pathAllowListGlobalSchema.safeParse({ enabled: true, allowList: [ '' ] }).success, false);
    });

    test('pathAllowListPerPackageSchema accepts an empty object', function () {
        assert.deepStrictEqual(parseOrFail(pathAllowListPerPackageSchema, {}), {});
    });

    test('pathAllowListPerPackageSchema accepts a per-package allow list of non-empty strings', function () {
        assert.deepStrictEqual(parseOrFail(pathAllowListPerPackageSchema, { allowList: [ 'a' ] }), {
            allowList: [ 'a' ]
        });
    });
});

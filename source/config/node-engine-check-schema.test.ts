import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checksPerPackageSchema, checksSchema } from './checks-schema.ts';

suite('Node engine check configuration', function () {
    test('accepts explicit activation and deactivation', function () {
        for (const enabled of [ true, false ]) {
            assert.deepStrictEqual(safeParse(checksSchema, { nodeEngineCompatibility: { enabled } }), {
                success: true,
                data: { nodeEngineCompatibility: { enabled } }
            });
        }
    });

    test('requires a boolean enabled flag and rejects unknown options', function () {
        for (const settings of [ {}, { enabled: 'true' }, { enabled: true, ignoreMissing: true } ]) {
            assert.strictEqual(safeParse(checksSchema, { nodeEngineCompatibility: settings }).success, false);
        }
    });

    test('accepts only an empty object per package', function () {
        assert.strictEqual(safeParse(checksPerPackageSchema, { nodeEngineCompatibility: {} }).success, true);
        assert.strictEqual(
            safeParse(checksPerPackageSchema, {
                nodeEngineCompatibility: { enabled: false }
            })
                .success,
            false
        );
    });
});

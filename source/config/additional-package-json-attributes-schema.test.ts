import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { additionalPackageJsonAttributesSchema } from './additional-package-json-attributes-schema.ts';

const forbiddenKeys = [
    'bin',
    'dependencies',
    'peerDependencies',
    'devDependencies',
    'exports',
    'imports',
    'main',
    'name',
    'types',
    'type',
    'version'
] as const;

suite('additional-package-json-attributes-schema', function () {
    test('additional attributes schema accepts allowed keys', function () {
        assert.strictEqual(safeParse(additionalPackageJsonAttributesSchema, { license: 'MIT' }).success, true);
    });

    test('additional attributes schema rejects forbidden object keys', function () {
        assert.strictEqual(safeParse(additionalPackageJsonAttributesSchema, { dependencies: {} }).success, false);
    });

    test(
        'additional package json attributes schema: validation succeeds for allowed keys',
        checkValidationSuccess({
            schema: additionalPackageJsonAttributesSchema,
            data: { license: 'MIT', repository: { type: 'git', url: 'https://example.test/repo.git' } },
            expectedData: { license: 'MIT', repository: { type: 'git', url: 'https://example.test/repo.git' } }
        })
    );

    suite('forbidden keys', function () {
        for (const key of forbiddenKeys) {
            test(
                `additional package json attributes schema: validation fails for forbidden key ${key}`,
                checkValidationFailure({
                    schema: additionalPackageJsonAttributesSchema,
                    data: { [key]: 'value' },
                    expectedMessages: [`at ${key}: invalid key`]
                })
            );
        }
    });

    test('additional package json attributes schema: every forbidden key is rejected', function () {
        for (const key of [
            'bin',
            'dependencies',
            'peerDependencies',
            'devDependencies',
            'exports',
            'imports',
            'main',
            'name',
            'types',
            'type',
            'version'
        ]) {
            const result = safeParse(additionalPackageJsonAttributesSchema, { [key]: 'value' });
            assert.strictEqual(result.success, false);
        }
    });
});

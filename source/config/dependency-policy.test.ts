import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { dependencyPolicySchema } from './dependency-policy.ts';

suite('dependency-policy', function () {
    test(
        'validation succeeds with an empty object',
        checkValidationSuccess({
            schema: dependencyPolicySchema,
            data: {},
            expectedData: {}
        })
    );

    test(
        'validation succeeds with an empty allow-list',
        checkValidationSuccess({
            schema: dependencyPolicySchema,
            data: { allowMutableSpecifiers: [] },
            expectedData: { allowMutableSpecifiers: [] }
        })
    );

    test(
        'validation succeeds with non-empty allow-list',
        checkValidationSuccess({
            schema: dependencyPolicySchema,
            data: { allowMutableSpecifiers: ['react', 'internal-tool'] },
            expectedData: { allowMutableSpecifiers: ['react', 'internal-tool'] }
        })
    );

    test(
        'validation fails when allowMutableSpecifiers is not an array',
        checkValidationFailure({
            schema: dependencyPolicySchema,
            data: { allowMutableSpecifiers: 'react' },
            expectedMessages: ['at allowMutableSpecifiers: expected array, but got string']
        })
    );

    test(
        'validation fails when an entry is not a string',
        checkValidationFailure({
            schema: dependencyPolicySchema,
            data: { allowMutableSpecifiers: [42] },
            expectedMessages: ['at allowMutableSpecifiers[0]: expected string, but got number']
        })
    );

    test(
        'validation fails when an entry is an empty string',
        checkValidationFailure({
            schema: dependencyPolicySchema,
            data: { allowMutableSpecifiers: [''] },
            expectedMessages: ['at allowMutableSpecifiers[0]: string must contain at least 1 character']
        })
    );

    test(
        'validation fails when an unknown property is given',
        checkValidationFailure({
            schema: dependencyPolicySchema,
            data: { allowMutableSpecifiers: [], extra: 'no' },
            expectedMessages: ['unexpected additional property: "extra"']
        })
    );
});

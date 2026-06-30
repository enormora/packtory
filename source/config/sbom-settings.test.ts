import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { sbomSettingsSchema } from './sbom-settings.ts';

suite('sbom-settings', function () {
    test(
        'validation succeeds with an empty object',
        checkValidationSuccess({
            schema: sbomSettingsSchema,
            data: {},
            expectedData: {}
        })
    );

    test(
        'validation succeeds with enabled true',
        checkValidationSuccess({
            schema: sbomSettingsSchema,
            data: { enabled: true },
            expectedData: { enabled: true }
        })
    );

    test(
        'validation succeeds with enabled false',
        checkValidationSuccess({
            schema: sbomSettingsSchema,
            data: { enabled: false },
            expectedData: { enabled: false }
        })
    );

    test(
        'validation fails when enabled is not a boolean',
        checkValidationFailure({
            schema: sbomSettingsSchema,
            data: { enabled: 'yes' },
            expectedMessages: [ 'at enabled: expected boolean, but got string' ]
        })
    );

    test(
        'validation fails when an unknown property is given',
        checkValidationFailure({
            schema: sbomSettingsSchema,
            data: { enabled: true, extra: 'no' },
            expectedMessages: [ 'unexpected additional property: "extra"' ]
        })
    );
});

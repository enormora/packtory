import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { softwareBillOfMaterialsSettingsSchema } from './software-bill-of-materials-settings.ts';

suite('sbom-settings', function () {
    test(
        'validation succeeds with an empty object',
        checkValidationSuccess({
            schema: softwareBillOfMaterialsSettingsSchema,
            data: {},
            expectedData: {}
        })
    );

    test(
        'validation succeeds with enabled true',
        checkValidationSuccess({
            schema: softwareBillOfMaterialsSettingsSchema,
            data: { enabled: true },
            expectedData: { enabled: true }
        })
    );

    test(
        'validation succeeds with enabled false',
        checkValidationSuccess({
            schema: softwareBillOfMaterialsSettingsSchema,
            data: { enabled: false },
            expectedData: { enabled: false }
        })
    );

    test(
        'validation fails when enabled is not a boolean',
        checkValidationFailure({
            schema: softwareBillOfMaterialsSettingsSchema,
            data: { enabled: 'yes' },
            expectedMessages: [ 'at enabled: expected boolean, but got string' ]
        })
    );

    test(
        'validation fails when an unknown property is given',
        checkValidationFailure({
            schema: softwareBillOfMaterialsSettingsSchema,
            data: { enabled: true, extra: 'no' },
            expectedMessages: [ 'unexpected additional property: "extra"' ]
        })
    );
});

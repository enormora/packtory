import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { publishSettingsSchema } from './publish-settings.ts';

test('schema accepts the minimal public publish settings', () => {
    assert.strictEqual(safeParse(publishSettingsSchema, { access: 'public' }).success, true);
});

test(
    'validation succeeds with public access and no provenance',
    checkValidationSuccess({
        schema: publishSettingsSchema,
        data: { access: 'public' },
        expectedData: { access: 'public' }
    })
);

test(
    'validation succeeds with public access and provenance auto mode',
    checkValidationSuccess({
        schema: publishSettingsSchema,
        data: { access: 'public', provenance: { type: 'auto' } },
        expectedData: { access: 'public', provenance: { type: 'auto' } }
    })
);

test(
    'validation succeeds with public access and provenance file mode',
    checkValidationSuccess({
        schema: publishSettingsSchema,
        data: { access: 'public', provenance: { type: 'file', path: './build/pkg.sigstore' } },
        expectedData: { access: 'public', provenance: { type: 'file', path: './build/pkg.sigstore' } }
    })
);

test(
    'validation succeeds with restricted access',
    checkValidationSuccess({
        schema: publishSettingsSchema,
        data: { access: 'restricted' },
        expectedData: { access: 'restricted' }
    })
);

test(
    'validation fails when restricted access carries provenance',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { access: 'restricted', provenance: { type: 'auto' } },
        expectedMessages: ['unexpected additional property: "provenance"']
    })
);

test(
    'validation fails when access is missing',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { provenance: { type: 'auto' } },
        expectedMessages: ['at access: missing property']
    })
);

test(
    'validation fails when access is an unknown literal',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { access: 'private' },
        expectedMessages: ['at access: invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when provenance type is missing',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { access: 'public', provenance: {} },
        expectedMessages: ['at provenance.type: missing property']
    })
);

test(
    'validation fails when provenance type is unknown',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { access: 'public', provenance: { type: 'unknown' } },
        expectedMessages: ['at provenance.type: invalid value doesn’t match expected union']
    })
);

test(
    'validation fails when provenance file path is missing',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { access: 'public', provenance: { type: 'file' } },
        expectedMessages: ['at provenance.path: missing property']
    })
);

test(
    'validation fails when provenance file path is empty',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { access: 'public', provenance: { type: 'file', path: '' } },
        expectedMessages: ['at provenance.path: string must contain at least 1 character']
    })
);

test(
    'validation fails when an additional property is given on a public publish settings block',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { access: 'public', extra: 'bar' },
        expectedMessages: ['unexpected additional property: "extra"']
    })
);

test(
    'validation succeeds with public access and sbom enabled true',
    checkValidationSuccess({
        schema: publishSettingsSchema,
        data: { access: 'public', sbom: { enabled: true } },
        expectedData: { access: 'public', sbom: { enabled: true } }
    })
);

test(
    'validation succeeds with public access and sbom enabled false',
    checkValidationSuccess({
        schema: publishSettingsSchema,
        data: { access: 'public', sbom: { enabled: false } },
        expectedData: { access: 'public', sbom: { enabled: false } }
    })
);

test(
    'validation succeeds with restricted access and sbom enabled true',
    checkValidationSuccess({
        schema: publishSettingsSchema,
        data: { access: 'restricted', sbom: { enabled: true } },
        expectedData: { access: 'restricted', sbom: { enabled: true } }
    })
);

test(
    'validation fails when sbom carries an unknown property',
    checkValidationFailure({
        schema: publishSettingsSchema,
        data: { access: 'public', sbom: { enabled: true, extra: 1 } },
        expectedMessages: ['at sbom: unexpected additional property: "extra"']
    })
);

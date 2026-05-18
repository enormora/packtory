import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PublishSettings } from '../../config/publish-settings.ts';
import { buildPublishOptionsForPublishSettings, remapPublishError } from './publish-settings-bridge.ts';

suite('publish-settings-bridge', function () {
    test('buildPublishOptionsForPublishSettings() emits access "restricted" only', function () {
        const result = buildPublishOptionsForPublishSettings({ access: 'restricted' });

        assert.deepStrictEqual(result, { access: 'restricted' });
    });

    test('buildPublishOptionsForPublishSettings() emits access "public" without provenance keys when provenance is omitted', function () {
        const result = buildPublishOptionsForPublishSettings({ access: 'public' });

        assert.deepStrictEqual(result, { access: 'public' });
    });

    test('buildPublishOptionsForPublishSettings() maps auto-mode provenance to provenance: true', function () {
        const result = buildPublishOptionsForPublishSettings({
            access: 'public',
            provenance: { type: 'auto' }
        });

        assert.deepStrictEqual(result, { access: 'public', provenance: true });
    });

    test('buildPublishOptionsForPublishSettings() maps file-mode provenance to provenanceFile', function () {
        const result = buildPublishOptionsForPublishSettings({
            access: 'public',
            provenance: { type: 'file', path: '/build/pkg.sigstore' }
        });

        assert.deepStrictEqual(result, { access: 'public', provenanceFile: '/build/pkg.sigstore' });
    });

    function expectRemapped(
        originalError: unknown,
        publishSettings: Readonly<PublishSettings>,
        expectedMessage: string
    ): void {
        const remapped = remapPublishError(originalError, publishSettings);

        assert.ok(remapped instanceof Error, 'Expected remapped value to be an Error');
        assert.strictEqual(remapped.message, expectedMessage);
        assert.strictEqual(remapped.cause, originalError, 'Expected the original error to be preserved as cause');
    }

    function buildUnsupportedProviderExpectedMessage(ciName: string): string {
        return [
            'Provenance auto mode requires GitHub Actions or GitLab CI.',
            `Detected CI: ${ciName}.`,
            "Use provenance: { type: 'file' } for other environments."
        ].join(' ');
    }

    const unsupportedProviderMessage = buildUnsupportedProviderExpectedMessage('jenkins');

    const githubActionsIdTokenExpectedMessage =
        'GitHub Actions provenance needs "permissions: id-token: write" on the workflow job.' +
        ' See the packtory readme for the workflow snippet.';

    const gitlabSigstoreIdTokenExpectedMessage =
        'GitLab CI provenance needs an "id_tokens" entry with audience "sigstore"' +
        ' exposed as SIGSTORE_ID_TOKEN. See the packtory readme for the workflow snippet.';

    const missingFileExpectedMessage =
        'Provenance bundle file "/build/pkg.sigstore" does not exist.' +
        " Generate it with your CI's attestation tool (e.g. actions/attest-build-provenance) before running packtory.";

    const invalidBundleExpectedMessage =
        'Provenance bundle file "/build/pkg.sigstore" is not a valid sigstore bundle. Re-generate it from the current build.';

    const digestMismatchExpectedMessage =
        'Provenance bundle at "/build/pkg.sigstore" was signed against a different tarball' +
        ' than the one packtory built. Re-generate the bundle from the current source —' +
        ' shipping a mismatched attestation would defeat the purpose of provenance.';

    test('remapPublishError() rewrites the "unsupported provider" libnpmpublish error with the detected CI name', function () {
        expectRemapped(
            Object.assign(new Error('Automatic provenance generation not supported for provider: jenkins'), {
                code: 'EUSAGE'
            }),
            { access: 'public', provenance: { type: 'auto' } },
            unsupportedProviderMessage
        );
    });

    test('remapPublishError() handles libnpmpublish messages where the provider follows the colon directly', function () {
        expectRemapped(
            Object.assign(new Error('Automatic provenance generation not supported for provider:circleci'), {
                code: 'EUSAGE'
            }),
            { access: 'public', provenance: { type: 'auto' } },
            buildUnsupportedProviderExpectedMessage('circleci')
        );
    });

    test('remapPublishError() falls back to "unknown" CI name when the libnpmpublish message lacks a provider', function () {
        expectRemapped(
            Object.assign(new Error('Automatic provenance generation not supported for provider:'), {
                code: 'EUSAGE'
            }),
            { access: 'public', provenance: { type: 'auto' } },
            buildUnsupportedProviderExpectedMessage('unknown')
        );
    });

    test('remapPublishError() extracts only the first whitespace-delimited token after the "provider:" marker', function () {
        expectRemapped(
            Object.assign(
                new Error('Automatic provenance generation not supported for provider: jenkins extra trailing'),
                {
                    code: 'EUSAGE'
                }
            ),
            { access: 'public', provenance: { type: 'auto' } },
            buildUnsupportedProviderExpectedMessage('jenkins')
        );
    });

    test('remapPublishError() rewrites the missing GitHub Actions id-token permission error', function () {
        expectRemapped(
            Object.assign(
                new Error(
                    'Provenance generation in GitHub Actions requires "write" access to the "id-token" permission'
                ),
                { code: 'EUSAGE' }
            ),
            { access: 'public', provenance: { type: 'auto' } },
            githubActionsIdTokenExpectedMessage
        );
    });

    test('remapPublishError() rewrites the missing GitLab SIGSTORE_ID_TOKEN error', function () {
        expectRemapped(
            Object.assign(
                new Error('Provenance generation in GitLab CI requires "SIGSTORE_ID_TOKEN" with "sigstore" audience'),
                { code: 'EUSAGE' }
            ),
            { access: 'public', provenance: { type: 'auto' } },
            gitlabSigstoreIdTokenExpectedMessage
        );
    });

    test('remapPublishError() rewrites a missing provenance bundle file (ENOENT) error', function () {
        expectRemapped(
            Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
            { access: 'public', provenance: { type: 'file', path: '/build/pkg.sigstore' } },
            missingFileExpectedMessage
        );
    });

    test('remapPublishError() rewrites an invalid sigstore bundle parse error', function () {
        expectRemapped(
            new Error('Bundle is invalid: malformed protobuf'),
            { access: 'public', provenance: { type: 'file', path: '/build/pkg.sigstore' } },
            invalidBundleExpectedMessage
        );
    });

    test('remapPublishError() rewrites a sigstore subject-digest mismatch error', function () {
        expectRemapped(
            new Error('Provenance subject does not match published package digest'),
            { access: 'public', provenance: { type: 'file', path: '/build/pkg.sigstore' } },
            digestMismatchExpectedMessage
        );
    });

    test('remapPublishError() classifies a "subject does not match" error as a digest mismatch even without the word "digest"', function () {
        expectRemapped(
            new Error('Provenance subject does not match'),
            { access: 'public', provenance: { type: 'file', path: '/build/pkg.sigstore' } },
            digestMismatchExpectedMessage
        );
    });

    test('remapPublishError() classifies a "Bundle is invalid" digest error as a digest mismatch even without the word "subject"', function () {
        expectRemapped(
            new Error('Bundle is invalid: digest verification failed'),
            { access: 'public', provenance: { type: 'file', path: '/build/pkg.sigstore' } },
            digestMismatchExpectedMessage
        );
    });

    test('remapPublishError() rewrites a generic invalid-bundle parse error without a digest hint', function () {
        expectRemapped(
            new Error('Unsupported bundle format'),
            { access: 'public', provenance: { type: 'file', path: '/build/pkg.sigstore' } },
            invalidBundleExpectedMessage
        );
    });

    test('remapPublishError() returns the original error when no remap rule matches', function () {
        const original = new Error('Network failure: ECONNRESET');

        const result = remapPublishError(original, { access: 'public' });

        assert.strictEqual(result, original);
    });

    test('remapPublishError() ignores file-mode patterns when publishSettings does not configure file provenance', function () {
        const original = new Error('Bundle is invalid: malformed protobuf');

        const result = remapPublishError(original, { access: 'public', provenance: { type: 'auto' } });

        assert.strictEqual(result, original);
    });

    test('remapPublishError() returns the original error in file mode when the failure is neither ENOENT nor a bundle error', function () {
        const original = new Error('Network failure: ECONNRESET');

        const result = remapPublishError(original, {
            access: 'public',
            provenance: { type: 'file', path: '/build/pkg.sigstore' }
        });

        assert.strictEqual(result, original);
    });

    test('remapPublishError() wraps a non-Error rejection value into an Error when no remap rule matches', function () {
        const result = remapPublishError('plain-string-failure', { access: 'public' });

        assert.ok(result instanceof Error);
        assert.strictEqual(result.message, 'plain-string-failure');
    });

    test('remapPublishError() wraps a null rejection value without dereferencing its non-existent message', function () {
        const result = remapPublishError(null, { access: 'public' });

        assert.ok(result instanceof Error);
        assert.strictEqual(result.message, 'null');
    });

    test('remapPublishError() wraps a null rejection value when publishSettings configures file provenance', function () {
        const result = remapPublishError(null, {
            access: 'public',
            provenance: { type: 'file', path: '/build/pkg.sigstore' }
        });

        assert.ok(result instanceof Error);
        assert.strictEqual(result.message, 'null');
    });

    test('remapPublishError() does not enter file-mode remapping when publishSettings has restricted access', function () {
        const original = new Error('Bundle is invalid: malformed protobuf');

        const result = remapPublishError(original, { access: 'restricted' });

        assert.strictEqual(result, original);
    });

    test('remapPublishError() guards against a runtime-only restricted+provenance combination that bypasses the type system', function () {
        const restrictedWithProvenance = {
            access: 'restricted',
            provenance: { type: 'file', path: '/build/pkg.sigstore' }
        } as unknown as PublishSettings;
        const original = new Error('Bundle is invalid: malformed protobuf');

        const result = remapPublishError(original, restrictedWithProvenance);

        assert.strictEqual(result, original);
    });

    test('remapPublishError() ignores a non-string message field on an object-like rejection value', function () {
        const result = remapPublishError({ message: 12_345 }, { access: 'public' });

        assert.ok(result instanceof Error);
        assert.strictEqual(result.message, '[object Object]');
    });
});

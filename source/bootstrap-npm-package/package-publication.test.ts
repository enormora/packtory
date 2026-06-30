import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createPackagePublication,
    type PackagePublication,
    type PackagePublicationDependencies,
    type PublicationManifest,
    type WebOtpUrls
} from './package-publication.ts';

type LibnpmpublishFunction = PackagePublicationDependencies['publish'];
type PublicationInput = Parameters<PackagePublication['publish']>[0];
type OneTimePasswordPrompt = PublicationInput['promptForOneTimePassword'];

type PublishCallRecord = {
    readonly manifest: PublicationManifest;
    readonly tarball: Buffer;
    readonly defaultTag: string;
    readonly access: 'public';
    readonly registry: string;
    readonly forceAuthToken: string;
    readonly authType: 'web';
    readonly otp: string | undefined;
};

type RecordingPublish = {
    readonly publish: LibnpmpublishFunction;
    readonly calls: readonly PublishCallRecord[];
};

function createOtpRequiredError(body: Readonly<Record<string, unknown>>): Error & {
    readonly code: 'EOTP';
    readonly body: Readonly<Record<string, unknown>>;
} {
    return Object.assign(new Error('OTP required for authentication'), { code: 'EOTP' as const, body });
}

function createRecordingPublish(): RecordingPublish {
    const calls: PublishCallRecord[] = [];
    const publish: LibnpmpublishFunction = async function (manifest, tarball, options) {
        calls.push({
            manifest,
            tarball,
            defaultTag: options.defaultTag,
            access: options.access,
            registry: options.registry,
            forceAuthToken: options.forceAuth.token,
            authType: options.authType,
            otp: options.otp
        });
        return undefined;
    };
    return { publish, calls };
}

type LibnpmpublishOptions = Parameters<LibnpmpublishFunction>[2];

function createPublishWithSingleOtpChallenge(
    challenge: Readonly<Record<string, unknown>>,
    onAccept: (retryOptions: LibnpmpublishOptions) => void
): LibnpmpublishFunction {
    let firstCall = true;
    return async function (_manifest, _tarball, options) {
        if (firstCall) {
            firstCall = false;
            if (options.otp !== undefined) {
                onAccept(options);
                return undefined;
            }
            throw createOtpRequiredError(challenge);
        }
        onAccept(options);
        return undefined;
    };
}

function createPublishWithBodylessOtpChallenge(): LibnpmpublishFunction {
    let firstCall = true;
    return async function (_manifest, _tarball, options) {
        if (firstCall) {
            firstCall = false;
            if (options.otp !== undefined) {
                return undefined;
            }
            throw Object.assign(new Error('OTP required'), { code: 'EOTP' as const });
        }
        return undefined;
    };
}

function buildInput(overrides: Partial<PublicationInput> = {}): PublicationInput {
    return {
        manifest: {
            name: '@scope/example',
            version: '0.0.1',
            description: 'placeholder',
            license: 'MIT',
            deprecated: 'placeholder'
        },
        tarball: Buffer.from('tarball-bytes'),
        token: 'bearer',
        registryUrl: 'https://registry.npmjs.org/',
        distTag: 'bootstrap',
        async promptForOneTimePassword() {
            return 'unused';
        },
        ...overrides
    };
}

function assertFirstPublishCallOptions(call: PublishCallRecord | undefined): void {
    assert.ok(call !== undefined);
    assert.strictEqual(call.defaultTag, 'bootstrap');
    assert.strictEqual(call.access, 'public');
    assert.strictEqual(call.registry, 'https://registry.npmjs.org/');
    assert.strictEqual(call.forceAuthToken, 'bearer');
    assert.strictEqual(call.authType, 'web');
    assert.strictEqual(call.otp, undefined);
}

function assertRetryOptions(retryOptions: LibnpmpublishOptions | undefined): void {
    assert.ok(retryOptions !== undefined);
    assert.strictEqual(retryOptions.otp, 'web-otp-token');
    assert.strictEqual(retryOptions.defaultTag, 'bootstrap');
    assert.strictEqual(retryOptions.access, 'public');
    assert.strictEqual(retryOptions.registry, 'https://registry.npmjs.org/');
    assert.strictEqual(retryOptions.forceAuth.token, 'bearer');
    assert.strictEqual(retryOptions.authType, 'web');
}

suite('package-publication', function () {
    test('invokes libnpmpublish with the supplied dist-tag, registry, token and web auth-type', async function () {
        const { publish, calls } = createRecordingPublish();
        const publication = createPackagePublication({ publish });

        await publication.publish(buildInput());

        assert.deepStrictEqual(calls.length, 1);
        const [ call ] = calls;
        assertFirstPublishCallOptions(call);
    });

    test('passes the manifest and tarball through unchanged', async function () {
        const { publish, calls } = createRecordingPublish();
        const publication = createPackagePublication({ publish });

        const manifest: PublicationManifest = {
            name: '@scope/another',
            version: '0.0.1',
            description: 'placeholder description',
            license: 'Apache-2.0',
            deprecated: 'placeholder'
        };
        const tarball = Buffer.from('payload');
        await publication.publish(buildInput({ manifest, tarball }));

        const [ call ] = calls;
        assert.ok(call !== undefined);
        assert.deepStrictEqual(call.manifest, manifest);
        assert.strictEqual(call.tarball, tarball);
    });

    test('forwards the web-OTP urls from an EOTP body to the prompt and retries with the returned OTP', async function () {
        const retries: LibnpmpublishOptions[] = [];
        const publish = createPublishWithSingleOtpChallenge(
            { authUrl: 'https://npmjs.com/auth/x', doneUrl: 'https://npmjs.com/done/x' },
            function (options) {
                retries.push(options);
            }
        );
        const recordedUrls: (WebOtpUrls | undefined)[] = [];
        const promptForOneTimePassword: OneTimePasswordPrompt = async function (urls) {
            recordedUrls.push(urls);
            return 'web-otp-token';
        };
        const publication = createPackagePublication({ publish });

        await publication.publish(buildInput({ promptForOneTimePassword }));

        assert.strictEqual(retries.length, 1);
        assert.deepStrictEqual(recordedUrls, [
            { authUrl: 'https://npmjs.com/auth/x', doneUrl: 'https://npmjs.com/done/x' }
        ]);
        const [ retryOptions ] = retries;
        assertRetryOptions(retryOptions);
    });

    async function runChallengeAndRecordPromptUrls(
        challenge: Readonly<Record<string, unknown>> | undefined
    ): Promise<readonly (WebOtpUrls | undefined)[]> {
        const noop = function (): void {
            return undefined;
        };
        const publish: LibnpmpublishFunction = challenge === undefined
            ? createPublishWithBodylessOtpChallenge()
            : createPublishWithSingleOtpChallenge(challenge, noop);
        const recordedUrls: (WebOtpUrls | undefined)[] = [];
        const promptForOneTimePassword: OneTimePasswordPrompt = async function (urls) {
            recordedUrls.push(urls);
            return 'classic-otp';
        };
        const publication = createPackagePublication({ publish });
        await publication.publish(buildInput({ promptForOneTimePassword }));
        return recordedUrls;
    }

    test('falls back to the prompt without urls when an EOTP body does not include web-OTP urls', async function () {
        const recordedUrls = await runChallengeAndRecordPromptUrls({ error: 'OTP required' });

        assert.deepStrictEqual(recordedUrls, [ undefined ]);
    });

    test('falls back to the prompt without urls when only `authUrl` is present in the EOTP body', async function () {
        const recordedUrls = await runChallengeAndRecordPromptUrls({ authUrl: 'https://npmjs.com/auth/x' });

        assert.deepStrictEqual(recordedUrls, [ undefined ]);
    });

    test('falls back to the prompt without urls when only `doneUrl` is present in the EOTP body', async function () {
        const recordedUrls = await runChallengeAndRecordPromptUrls({ doneUrl: 'https://npmjs.com/done/x' });

        assert.deepStrictEqual(recordedUrls, [ undefined ]);
    });

    test('falls back to the prompt without urls when the EOTP error has no body', async function () {
        const recordedUrls = await runChallengeAndRecordPromptUrls(undefined);

        assert.deepStrictEqual(recordedUrls, [ undefined ]);
    });

    test('propagates non-EOTP errors thrown by libnpmpublish without retrying', async function () {
        let callCount = 0;
        const publish: LibnpmpublishFunction = async function () {
            callCount += 1;
            throw new Error('npm registry returned 403');
        };
        const publication = createPackagePublication({ publish });

        try {
            await publication.publish(buildInput());
            assert.fail('expected publish to throw');
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'npm registry returned 403');
            assert.strictEqual(callCount, 1);
        }
    });
});

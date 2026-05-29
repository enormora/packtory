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

function createOtpRequiredError(body: Readonly<Record<string, unknown>>): Error & {
    readonly code: 'EOTP';
    readonly body: Readonly<Record<string, unknown>>;
} {
    return Object.assign(new Error('OTP required for authentication'), { code: 'EOTP' as const, body });
}

function createRecordingPublish(): {
    readonly publish: LibnpmpublishFunction;
    readonly calls: readonly PublishCallRecord[];
} {
    const calls: PublishCallRecord[] = [];
    const publish: LibnpmpublishFunction = async (manifest, tarball, options) => {
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

function createPublishWithSingleOtpChallenge(
    challenge: Readonly<Record<string, unknown>>,
    onAccept: () => void
): LibnpmpublishFunction {
    let firstCall = true;
    return async (_manifest, _tarball, options) => {
        if (firstCall) {
            firstCall = false;
            if (options.otp !== undefined) {
                onAccept();
                return undefined;
            }
            throw createOtpRequiredError(challenge);
        }
        onAccept();
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
        promptForOneTimePassword: async () => {
            return 'unused';
        },
        ...overrides
    };
}

suite('package-publication', function () {
    test('invokes libnpmpublish with the supplied dist-tag, registry, token and web auth-type', async function () {
        const { publish, calls } = createRecordingPublish();
        const publication = createPackagePublication({ publish });

        await publication.publish(buildInput());

        assert.deepStrictEqual(calls.length, 1);
        const [call] = calls;
        assert.ok(call !== undefined);
        assert.strictEqual(call.defaultTag, 'bootstrap');
        assert.strictEqual(call.access, 'public');
        assert.strictEqual(call.registry, 'https://registry.npmjs.org/');
        assert.strictEqual(call.forceAuthToken, 'bearer');
        assert.strictEqual(call.authType, 'web');
        assert.strictEqual(call.otp, undefined);
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

        const [call] = calls;
        assert.ok(call !== undefined);
        assert.deepStrictEqual(call.manifest, manifest);
        assert.strictEqual(call.tarball, tarball);
    });

    test('forwards the web-OTP urls from an EOTP body to the prompt and retries with the returned OTP', async function () {
        let success = false;
        const publish = createPublishWithSingleOtpChallenge(
            { authUrl: 'https://npmjs.com/auth/x', doneUrl: 'https://npmjs.com/done/x' },
            () => {
                success = true;
            }
        );
        const recordedUrls: (WebOtpUrls | undefined)[] = [];
        const promptForOneTimePassword: OneTimePasswordPrompt = async (urls) => {
            recordedUrls.push(urls);
            return 'web-otp-token';
        };
        const publication = createPackagePublication({ publish });

        await publication.publish(buildInput({ promptForOneTimePassword }));

        assert.strictEqual(success, true);
        assert.deepStrictEqual(recordedUrls, [
            { authUrl: 'https://npmjs.com/auth/x', doneUrl: 'https://npmjs.com/done/x' }
        ]);
    });

    test('falls back to the prompt without urls when an EOTP body does not include web-OTP urls', async function () {
        const publish = createPublishWithSingleOtpChallenge({ error: 'OTP required' }, () => {
            /* ignored */
        });
        const recordedUrls: (WebOtpUrls | undefined)[] = [];
        const promptForOneTimePassword: OneTimePasswordPrompt = async (urls) => {
            recordedUrls.push(urls);
            return '123456';
        };
        const publication = createPackagePublication({ publish });

        await publication.publish(buildInput({ promptForOneTimePassword }));

        assert.deepStrictEqual(recordedUrls, [undefined]);
    });

    test('falls back to the prompt without urls when the EOTP error has no body', async function () {
        let firstCall = true;
        const publish: LibnpmpublishFunction = async (_manifest, _tarball, options) => {
            if (firstCall) {
                firstCall = false;
                if (options.otp !== undefined) {
                    return undefined;
                }
                throw Object.assign(new Error('OTP required'), { code: 'EOTP' as const });
            }
            return undefined;
        };
        const recordedUrls: (WebOtpUrls | undefined)[] = [];
        const promptForOneTimePassword: OneTimePasswordPrompt = async (urls) => {
            recordedUrls.push(urls);
            return '123456';
        };
        const publication = createPackagePublication({ publish });

        await publication.publish(buildInput({ promptForOneTimePassword }));

        assert.deepStrictEqual(recordedUrls, [undefined]);
    });

    test('propagates non-EOTP errors thrown by libnpmpublish without retrying', async function () {
        let callCount = 0;
        const publish: LibnpmpublishFunction = async () => {
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

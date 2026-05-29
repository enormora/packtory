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
    readonly authType: 'web';
    readonly forceAuthToken: string | undefined;
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
            authType: options.authType,
            forceAuthToken: options.forceAuth?.token
        });
        return undefined;
    };
    return { publish, calls };
}

function createPublishThatRequiresOtpOnce(
    challenge: Readonly<Record<string, unknown>>,
    onAccept: (forceAuthToken: string | undefined) => void
): LibnpmpublishFunction {
    let firstCall = true;
    return async (_manifest, _tarball, options) => {
        if (firstCall) {
            firstCall = false;
            if (options.forceAuth?.token === undefined) {
                throw createOtpRequiredError(challenge);
            }
        }
        onAccept(options.forceAuth?.token);
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
        registryUrl: 'https://registry.npmjs.org/',
        distTag: 'bootstrap',
        promptForOneTimePassword: async () => {
            return 'unused';
        },
        ...overrides
    };
}

suite('package-publication', function () {
    test('invokes libnpmpublish with the supplied dist-tag, registry and web auth-type and no force-auth', async function () {
        const { publish, calls } = createRecordingPublish();
        const publication = createPackagePublication({ publish });

        await publication.publish(buildInput());

        assert.deepStrictEqual(calls.length, 1);
        const [call] = calls;
        assert.ok(call !== undefined);
        assert.strictEqual(call.defaultTag, 'bootstrap');
        assert.strictEqual(call.access, 'public');
        assert.strictEqual(call.registry, 'https://registry.npmjs.org/');
        assert.strictEqual(call.authType, 'web');
        assert.strictEqual(call.forceAuthToken, undefined);
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

    test('forwards web-OTP urls from an EOTP body to the prompt and retries with the returned token as force-auth', async function () {
        const acceptedTokens: (string | undefined)[] = [];
        const publish = createPublishThatRequiresOtpOnce(
            { authUrl: 'https://npmjs.com/auth/x', doneUrl: 'https://npmjs.com/done/x' },
            (token) => {
                acceptedTokens.push(token);
            }
        );
        const recordedUrls: (WebOtpUrls | undefined)[] = [];
        const promptForOneTimePassword: OneTimePasswordPrompt = async (urls) => {
            recordedUrls.push(urls);
            return 'web-approval-token';
        };
        const publication = createPackagePublication({ publish });

        await publication.publish(buildInput({ promptForOneTimePassword }));

        assert.deepStrictEqual(recordedUrls, [
            { authUrl: 'https://npmjs.com/auth/x', doneUrl: 'https://npmjs.com/done/x' }
        ]);
        assert.deepStrictEqual(acceptedTokens, ['web-approval-token']);
    });

    test('falls back to the prompt without urls when an EOTP body does not include web-OTP urls', async function () {
        const publish = createPublishThatRequiresOtpOnce({ error: 'OTP required' }, () => {
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
                if (options.forceAuth?.token === undefined) {
                    throw Object.assign(new Error('OTP required'), { code: 'EOTP' as const });
                }
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

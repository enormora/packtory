import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createPackagePublication,
    type PackagePublication,
    type PackagePublicationDependencies,
    type PublicationManifest
} from './package-publication.ts';

type LibnpmpublishFunction = PackagePublicationDependencies['publish'];
type PublicationInput = Parameters<PackagePublication['publish']>[0];

type PublishCallRecord = {
    readonly manifest: PublicationManifest;
    readonly tarball: Buffer;
    readonly defaultTag: string;
    readonly access: 'public';
    readonly registry: string;
    readonly forceAuthToken: string;
};

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
            forceAuthToken: options.forceAuth.token
        });
        return undefined;
    };
    return { publish, calls };
}

function buildInput(overrides: Partial<PublicationInput> = {}): PublicationInput {
    return {
        manifest: {
            name: '@scope/example',
            version: '0.0.1',
            description: 'placeholder',
            license: 'MIT'
        },
        tarball: Buffer.from('tarball-bytes'),
        token: 'bearer',
        registryUrl: 'https://registry.npmjs.org/',
        distTag: 'bootstrap',
        ...overrides
    };
}

suite('package-publication', function () {
    test('invokes libnpmpublish with the supplied dist-tag, registry and token', async function () {
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
    });

    test('passes the manifest and tarball through unchanged', async function () {
        const { publish, calls } = createRecordingPublish();
        const publication = createPackagePublication({ publish });

        const manifest: PublicationManifest = {
            name: '@scope/another',
            version: '0.0.1',
            description: 'placeholder description',
            license: 'Apache-2.0'
        };
        const tarball = Buffer.from('payload');
        await publication.publish(buildInput({ manifest, tarball }));

        const [call] = calls;
        assert.ok(call !== undefined);
        assert.deepStrictEqual(call.manifest, manifest);
        assert.strictEqual(call.tarball, tarball);
    });

    test('propagates errors thrown by libnpmpublish', async function () {
        const publication = createPackagePublication({
            publish: async () => {
                throw new Error('npm registry returned 403');
            }
        });

        try {
            await publication.publish(buildInput());
            assert.fail('expected publish to throw');
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'npm registry returned 403');
        }
    });
});

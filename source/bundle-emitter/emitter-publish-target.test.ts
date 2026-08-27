import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { emptyTarball, tarballWithOneFile } from '../test-libraries/tarball-fixtures.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createBundleEmitter, type BundleEmitter, type BundleEmitterDependencies } from './emitter.ts';

const registrySettings = { auth: { type: 'bearer-token', token: 'the-token' } } as const;
const publishedAt = new Date('2026-05-20T00:00:00.000Z');
const emptyTarballIntegrity = { integrity: undefined, shasum: undefined } as const;
const targetReleaseMetadata = {
    version: '1.2.4',
    tarballUrl: 'https://registry.example.test/package-1.2.4.tgz',
    tarballIntegrity: emptyTarballIntegrity,
    publishedAt,
    gitHead: undefined,
    latestVersion: '1.2.4'
} as const;
type TargetReleaseMetadata = {
    readonly version: string;
    readonly tarballUrl: string;
    readonly tarballIntegrity: typeof emptyTarballIntegrity;
    readonly publishedAt: Date | undefined;
    readonly gitHead: string | undefined;
    readonly latestVersion: string | undefined;
};

type Overrides = {
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
    readonly fetchVersionReleaseMetadata?: SinonSpy;
};
type TargetVerificationInput = {
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
    readonly metadata: TargetReleaseMetadata;
};

function createSpy<TSpy extends SinonSpy>(spy: Readonly<TSpy> | undefined, fallback: () => TSpy): TSpy {
    if (spy === undefined) {
        return fallback();
    }
    return spy as TSpy;
}

function versionedNamedBundle(version: string): VersionedBundleWithManifest {
    return versionedBundleWithManifest({
        name: 'the-name',
        version,
        packageJson: { name: 'the-name', version }
    });
}

function emitterFactory(overrides: Overrides = {}): BundleEmitter {
    const collectContents = createSpy(overrides.collectContents, function () {
        return fake.returns([]);
    });
    const fetchTarball = createSpy(overrides.fetchTarball, function () {
        return fake.resolves(emptyTarball);
    });
    const fetchVersionReleaseMetadata = createSpy(
        overrides.fetchVersionReleaseMetadata,
        fake
    );
    const dependencies: BundleEmitterDependencies = {
        artifactsBuilder: {
            buildTarball: fake.resolves({ tarData: emptyTarball }),
            collectContents,
            buildFolder: fake(),
            buildZip: fake()
        },
        registryClient: {
            publishPackage: fake(),
            fetchLatestReleaseMetadata: fake(),
            fetchLatestVersion: fake(),
            fetchVersionReleaseMetadata,
            fetchStagedVersions: fake(),
            fetchTarball
        },
        ciRepositoryUrl: undefined,
        async readCurrentGitHead() {
            return undefined;
        }
    };

    return createBundleEmitter(dependencies);
}

async function verifyTarget(input: TargetVerificationInput): ReturnType<BundleEmitter['verifyBundlePublishTarget']> {
    const fetchVersionReleaseMetadata = fake.resolves(Maybe.just(input.metadata));
    const emitter = emitterFactory({
        fetchVersionReleaseMetadata,
        ...input.fetchTarball === undefined ? {} : { fetchTarball: input.fetchTarball },
        ...input.collectContents === undefined ? {} : { collectContents: input.collectContents }
    });

    return emitter.verifyBundlePublishTarget({
        registrySettings,
        bundle: versionedNamedBundle('1.2.4')
    });
}

suite('emitter publish target verification', function () {
    test('verifyBundlePublishTarget() fetches the exact target release metadata', async function () {
        const fetchVersionReleaseMetadata = fake.resolves(Maybe.nothing());
        const emitter = emitterFactory({ fetchVersionReleaseMetadata });

        await emitter.verifyBundlePublishTarget({
            registrySettings,
            bundle: versionedNamedBundle('1.2.4')
        });

        assert.deepStrictEqual(fetchVersionReleaseMetadata.firstCall.args, [
            'the-name',
            '1.2.4',
            registrySettings
        ]);
    });

    test('verifyBundlePublishTarget() allows publishing when the exact target is missing', async function () {
        const fetchVersionReleaseMetadata = fake.resolves(Maybe.nothing());
        const fetchTarball = fake.resolves(emptyTarball);
        const collectContents = fake.returns([]);
        const emitter = emitterFactory({ fetchVersionReleaseMetadata, fetchTarball, collectContents });

        const result = await emitter.verifyBundlePublishTarget({
            registrySettings,
            bundle: versionedNamedBundle('1.2.4')
        });

        assert.deepStrictEqual(result, {
            alreadyPublished: false,
            publishedArtifacts: Maybe.nothing()
        });
        assert.strictEqual(fetchTarball.callCount, 0);
        assert.strictEqual(collectContents.callCount, 0);
    });

    test('verifyBundlePublishTarget() returns already-published when the exact latest target matches', async function () {
        const fetchTarball = fake.resolves(emptyTarball);
        const collectContents = fake.returns([]);
        const result = await verifyTarget({ metadata: targetReleaseMetadata, fetchTarball, collectContents });

        assert.strictEqual(result.alreadyPublished, true);
        if (result.publishedArtifacts.isNothing) {
            assert.fail('expected exact published artifacts');
        }
        assert.deepStrictEqual(result.publishedArtifacts.value, {
            version: '1.2.4',
            publishedAt,
            gitHead: undefined,
            files: []
        });
        assert.deepStrictEqual(fetchTarball.firstCall.args, [
            targetReleaseMetadata.tarballUrl,
            targetReleaseMetadata.tarballIntegrity,
            registrySettings
        ]);
    });

    test('verifyBundlePublishTarget() rejects matching artifacts when the exact target is not latest', async function () {
        await assert.rejects(async function () {
            await verifyTarget({
                metadata: { ...targetReleaseMetadata, latestVersion: '1.2.3' }
            });
        }, { message: 'Package "the-name" version "1.2.4" already exists but is not tagged latest' });
    });

    test('verifyBundlePublishTarget() rejects exact target artifact mismatches', async function () {
        const fetchTarball = fake.resolves(tarballWithOneFile);
        const collectContents = fake.returns([]);

        await assert.rejects(async function () {
            await verifyTarget({ metadata: targetReleaseMetadata, fetchTarball, collectContents });
        }, { message: 'Package "the-name" version "1.2.4" already exists with different artifacts' });
    });
});

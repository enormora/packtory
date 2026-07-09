import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import type { PublishSettings } from '../config/publish-settings.ts';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { emptyTarball } from '../test-libraries/tarball-fixtures.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createBundleEmitter, type BundleEmitter, type BundleEmitterDependencies } from './emitter.ts';

const registrySettings = { auth: { type: 'bearer-token', token: 'the-token' } } as const;
const publishedOutcome = { type: 'published' } as const;
const publishedAt = new Date('2026-05-20T00:00:00.000Z');
const latestReleaseMetadata = {
    version: '1.2.3',
    tarballUrl: 'https://registry.example.test/package.tgz'
} as const;
type PublishRequest = Parameters<BundleEmitter['publish']>[0];
type PublishParams = {
    readonly bundle?: PublishRequest['bundle'];
    readonly publishSettings: PublishRequest['publishSettings'];
    readonly stage?: boolean;
    readonly extraFiles?: PublishRequest['extraFiles'];
};
type PublishScenario = {
    readonly buildTarball: SinonSpy;
    readonly publishPackage: SinonSpy;
    readonly emitter: BundleEmitter;
};
type Overrides = {
    readonly buildTarball?: SinonSpy;
    readonly publishPackage?: SinonSpy;
    readonly fetchLatestReleaseMetadata?: SinonSpy;
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
    readonly ciRepositoryUrl?: string | undefined;
    readonly readCurrentGitHead?: () => Promise<string | undefined>;
};

function namedBundle(): VersionedBundleWithManifest {
    return versionedBundleWithManifest({ name: 'the-name' });
}

function bundleWithRepository(repository: string | undefined): VersionedBundleWithManifest {
    const packageJson = repository === undefined ? { name: 'the-name' } : { name: 'the-name', repository };
    return versionedBundleWithManifest({ packageJson });
}

function createSpy<TSpy extends Readonly<SinonSpy>>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

function emitterFactory(overrides: Overrides = {}): BundleEmitter {
    const dependencies: BundleEmitterDependencies = {
        artifactsBuilder: {
            buildTarball: createSpy(overrides.buildTarball, function () {
                return fake.resolves({ tarData: emptyTarball });
            }),
            collectContents: createSpy(overrides.collectContents, function () {
                return fake.returns([]);
            }),
            buildFolder: fake(),
            buildZip: fake()
        },
        registryClient: {
            publishPackage: createSpy(
                overrides.publishPackage,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['publishPackage'],
            fetchLatestReleaseMetadata: createSpy(
                overrides.fetchLatestReleaseMetadata,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['fetchLatestReleaseMetadata'],
            fetchLatestVersion: fake(),
            fetchStagedVersions: fake(),
            fetchTarball: createSpy(overrides.fetchTarball, function () {
                return fake.resolves(emptyTarball);
            })
        },
        ciRepositoryUrl: overrides.ciRepositoryUrl,
        readCurrentGitHead: overrides.readCurrentGitHead ?? async function () {
            return undefined;
        }
    };

    return createBundleEmitter(dependencies);
}

function publishRequest(params: PublishParams): PublishRequest {
    return {
        registrySettings,
        bundle: params.bundle ?? namedBundle(),
        publishSettings: params.publishSettings,
        stage: params.stage ?? false,
        ...params.extraFiles !== undefined && { extraFiles: params.extraFiles }
    };
}

async function publishBundle(emitter: BundleEmitter, params: PublishParams): Promise<void> {
    await emitter.publish(publishRequest(params));
}

function createPublishScenario(ciRepositoryUrl: string | undefined): PublishScenario {
    const buildTarball = fake.resolves({ tarData: emptyTarball });
    const publishPackage = fake.resolves(publishedOutcome);
    return {
        buildTarball,
        publishPackage,
        emitter: emitterFactory({ buildTarball, publishPackage, ciRepositoryUrl })
    };
}

suite('emitter publish', function () {
    test('publish() publishes the given bundle', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(publishedOutcome);
        const emitter = emitterFactory({ buildTarball, publishPackage });
        const publishSettings = { access: 'public' } as const;

        await publishBundle(emitter, { publishSettings });

        assert.deepStrictEqual(
            { callCount: publishPackage.callCount, args: publishPackage.firstCall.args },
            {
                callCount: 1,
                args: [ { name: '', version: '' }, emptyTarball, registrySettings, publishSettings, false ]
            }
        );
    });

    test('publish() adds the current git head to the registry manifest without changing the bundle manifest', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const publishPackage = fake.resolves(publishedOutcome);
        const bundle = versionedBundleWithManifest({
            packageJson: { name: 'the-name', version: '1.0.0' },
            manifestFile: { content: '{"name":"the-name","version":"1.0.0"}' }
        });
        const emitter = emitterFactory({
            buildTarball,
            publishPackage,
            async readCurrentGitHead() {
                return 'abcdef123456';
            }
        });
        const publishSettings = { access: 'public' } as const;

        await publishBundle(emitter, { bundle, publishSettings });

        assert.deepStrictEqual(publishPackage.firstCall.args[0], {
            name: 'the-name',
            version: '1.0.0',
            gitHead: 'abcdef123456'
        });
        assert.deepStrictEqual(buildTarball.firstCall.args[0], bundle);
        assert.partialDeepStrictEqual(bundle, {
            manifestFile: { content: '{"name":"the-name","version":"1.0.0"}' },
            packageJson: { name: 'the-name', version: '1.0.0' }
        });
    });

    test('checkBundleAlreadyPublished() ignores gitHead-only manifest differences', async function () {
        const previousTarball = await createTarballBuilder().build([
            {
                filePath: 'package/package.json',
                content: '{"name":"the-name","version":"1.0.0","gitHead":"old"}',
                isExecutable: false
            }
        ]);
        const fetchLatestReleaseMetadata = fake.resolves(
            Maybe.just({
                version: latestReleaseMetadata.version,
                tarballUrl: latestReleaseMetadata.tarballUrl,
                publishedAt,
                gitHead: 'old'
            })
        );
        const fetchTarball = fake.resolves(previousTarball);
        const collectContents = fake.returns([
            {
                filePath: 'package/package.json',
                content: '{"name":"the-name","version":"1.0.0","gitHead":"new"}',
                isExecutable: false
            }
        ]);
        const emitter = emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents });

        const result = await emitter.checkBundleAlreadyPublished({ registrySettings, bundle: namedBundle() });

        assert.strictEqual(result.alreadyPublishedAsLatest, true);
    });

    test('publish() forwards extra files to buildTarball', async function () {
        const buildTarball = fake.resolves({ tarData: emptyTarball });
        const emitter = emitterFactory({ buildTarball });
        const bundle = namedBundle();
        const extraFile = { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false };

        await publishBundle(emitter, {
            bundle,
            publishSettings: { access: 'public' },
            extraFiles: [ extraFile ]
        });

        assert.deepStrictEqual(buildTarball.firstCall.args, [ bundle, [ extraFile ] ]);
    });

    test('publish() rejects under provenance auto mode when the manifest repository differs from the CI repository', async function () {
        const scenario = createPublishScenario('https://github.com/upstream/package');

        try {
            await publishBundle(scenario.emitter, {
                bundle: bundleWithRepository('https://github.com/foo/forked-package'),
                publishSettings: { access: 'public', provenance: { type: 'auto' } }
            });
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.match(error.message, /repository URL does not match/u);
            assert.deepStrictEqual(
                { buildTarball: scenario.buildTarball.callCount, publishPackage: scenario.publishPackage.callCount },
                { buildTarball: 0, publishPackage: 0 }
            );
            return;
        }
        assert.fail('Expected publish() to throw');
    });

    test('publish() does not run the coherence check under provenance file mode', async function () {
        const scenario = createPublishScenario('https://github.com/upstream/package');

        await publishBundle(scenario.emitter, {
            bundle: bundleWithRepository('https://github.com/foo/forked-package'),
            publishSettings: { access: 'public', provenance: { type: 'file', path: '/build/bundle.sigstore' } }
        });

        assert.deepStrictEqual(
            { buildTarball: scenario.buildTarball.callCount, publishPackage: scenario.publishPackage.callCount },
            { buildTarball: 1, publishPackage: 1 }
        );
    });

    test('publish() does not run the coherence check when provenance is unset', async function () {
        const scenario = createPublishScenario(undefined);

        await publishBundle(scenario.emitter, {
            bundle: bundleWithRepository(undefined),
            publishSettings: { access: 'public' }
        });

        assert.deepStrictEqual(
            { buildTarball: scenario.buildTarball.callCount, publishPackage: scenario.publishPackage.callCount },
            { buildTarball: 1, publishPackage: 1 }
        );
    });

    test('publish() does not run the coherence check when access is restricted even if provenance is set to auto', async function () {
        const scenario = createPublishScenario('https://github.com/upstream/package');

        await publishBundle(scenario.emitter, {
            bundle: bundleWithRepository('https://github.com/foo/forked-package'),
            publishSettings: { access: 'restricted', provenance: { type: 'auto' } } as unknown as PublishSettings
        });

        assert.deepStrictEqual(
            { buildTarball: scenario.buildTarball.callCount, publishPackage: scenario.publishPackage.callCount },
            { buildTarball: 1, publishPackage: 1 }
        );
    });
});

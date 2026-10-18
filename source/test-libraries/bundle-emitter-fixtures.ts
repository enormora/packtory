import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createBundleEmitter, type BundleEmitter, type BundleEmitterDependencies } from '../bundle-emitter/emitter.ts';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { versionedBundleWithManifest } from './bundle-fixtures.ts';
import { buildSoftwareBillOfMaterialsFixtureContent } from './software-bill-of-materials-fixtures.ts';
import { emptyTarball, tarballWithOneFile } from './tarball-fixtures.ts';

export const registrySettings = { authentication: { type: 'bearer-token', token: 'the-token' } } as const;

const publishedAt = new Date('2026-05-20T00:00:00.000Z');

const emptyTarballIntegrity = { integrity: undefined, shasum: undefined } as const;

export const latestReleaseMetadata = {
    version: '1.2.3',
    tarballAddress: 'https://registry.example.test/package.tgz',
    tarballIntegrity: emptyTarballIntegrity,
    publishedAt,
    gitHead: undefined
} as const;

type CurrentVersionRequest = Parameters<BundleEmitter['determineCurrentVersion']>[0];

export type BundlePublishedCheckResult = Awaited<ReturnType<BundleEmitter['checkBundleAlreadyPublished']>>;

export type CurrentVersionInput = {
    readonly stage: boolean;
    readonly versioning: CurrentVersionRequest['versioning'];
    readonly registrySettings?: CurrentVersionRequest['registrySettings'];
};

export type SoftwareBillOfMaterialsDependency = {
    readonly packtoryVersion: string;
    readonly dependencyName: string;
    readonly dependencyVersion: string;
};

export type PublishedBundleScenario = {
    readonly emitter: BundleEmitter;
    readonly collectContents: SinonSpy;
    readonly fetchTarball: SinonSpy;
};

type PreviousReleaseArtifactsSummary = {
    readonly version: string;
    readonly publishedAt?: Date | undefined;
    readonly files: readonly unknown[];
};

export function namedBundle(): VersionedBundleWithManifest {
    return versionedBundleWithManifest({ name: 'the-name' });
}

export type Overrides = {
    readonly fetchLatestVersion?: SinonSpy;
    readonly fetchVersionReleaseMetadata?: SinonSpy;
    readonly fetchStagedVersions?: SinonSpy;
    readonly fetchLatestReleaseMetadata?: SinonSpy;
    readonly collectContents?: SinonSpy;
    readonly fetchTarball?: SinonSpy;
    readonly currentGitHead?: string | undefined;
};

function createSpy<TSpy extends Readonly<SinonSpy>>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

export function emitterFactory(overrides: Overrides = {}): BundleEmitter {
    const dependencies: BundleEmitterDependencies = {
        artifactsBuilder: {
            buildTarball: fake.resolves({ tarData: emptyTarball }),
            collectContents: createSpy(overrides.collectContents, function () {
                return fake.returns([]);
            }),
            buildFolder: fake(),
            buildZip: fake()
        },
        registryClient: {
            publishPackage: fake(),
            fetchLatestReleaseMetadata: createSpy(
                overrides.fetchLatestReleaseMetadata,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['fetchLatestReleaseMetadata'],
            fetchLatestVersion: createSpy(
                overrides.fetchLatestVersion,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['fetchLatestVersion'],
            fetchVersionReleaseMetadata: createSpy(
                overrides.fetchVersionReleaseMetadata,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['fetchVersionReleaseMetadata'],
            fetchStagedVersions: createSpy(
                overrides.fetchStagedVersions,
                fake
            ) as unknown as BundleEmitterDependencies['registryClient']['fetchStagedVersions'],
            fetchTarball: createSpy(overrides.fetchTarball, function () {
                return fake.resolves(emptyTarball);
            })
        },
        continuousIntegrationRepositoryAddress: undefined,
        async readCurrentGitHead() {
            return overrides.currentGitHead;
        }
    };

    return createBundleEmitter(dependencies);
}

function currentVersionRequest(input: CurrentVersionInput): CurrentVersionRequest {
    return {
        name: 'the-name',
        registrySettings: input.registrySettings ?? registrySettings,
        stage: input.stage,
        versioning: input.versioning
    };
}

export async function determineCurrentVersion(
    emitter: BundleEmitter,
    input: CurrentVersionInput
): Promise<Maybe<string>> {
    return emitter.determineCurrentVersion(currentVersionRequest(input));
}

export async function expectCurrentVersionFailure(
    emitter: BundleEmitter,
    input: CurrentVersionInput,
    matcher: RegExp
): Promise<void> {
    await assert.rejects(async function () {
        await determineCurrentVersion(emitter, input);
    }, matcher);
}

export function buildSoftwareBillOfMaterialsWithDependency(input: SoftwareBillOfMaterialsDependency): string {
    return buildSoftwareBillOfMaterialsFixtureContent({
        packtoryVersion: input.packtoryVersion,
        dependencyComponents: [ { name: input.dependencyName, version: input.dependencyVersion } ]
    });
}

export function createPublishedBundleScenario(): PublishedBundleScenario {
    const fetchLatestReleaseMetadata = fake.resolves(Maybe.just(latestReleaseMetadata));
    const fetchTarball = fake.resolves(tarballWithOneFile);
    const collectContents = fake.returns([]);
    return {
        emitter: emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents }),
        collectContents,
        fetchTarball
    };
}

export async function runSoftwareBillOfMaterialsComparison(
    previousSoftwareBillOfMaterials: string,
    currentSoftwareBillOfMaterials: string
): Promise<boolean> {
    const previousTarball = await createTarballBuilder().build([
        {
            filePath: 'software-bill-of-materials.cyclonedx.json',
            content: previousSoftwareBillOfMaterials,
            isExecutable: false
        }
    ]);
    const fetchLatestReleaseMetadata = fake.resolves(
        Maybe.just({
            version: latestReleaseMetadata.version,
            tarballAddress: latestReleaseMetadata.tarballAddress,
            tarballIntegrity: latestReleaseMetadata.tarballIntegrity,
            publishedAt,
            gitHead: undefined
        })
    );
    const fetchTarball = fake.resolves(previousTarball);
    const collectContents = fake.returns([ {
        filePath: 'software-bill-of-materials.cyclonedx.json',
        content: currentSoftwareBillOfMaterials,
        isExecutable: false
    } ]);
    const emitter = emitterFactory({ fetchLatestReleaseMetadata, fetchTarball, collectContents });
    const result = await emitter.checkBundleAlreadyPublished({ registrySettings, bundle: namedBundle() });
    return result.alreadyPublishedAsLatest;
}

function assertPreviousReleaseArtifacts(
    value: PreviousReleaseArtifactsSummary,
    expectedFileCount?: number
): void {
    assert.partialDeepStrictEqual(value, {
        version: latestReleaseMetadata.version,
        publishedAt
    });

    if (expectedFileCount !== undefined) {
        assert.strictEqual(value.files.length, expectedFileCount);
    }
}

export function assertDifferentContentsResult(
    result: BundlePublishedCheckResult,
    bundle: VersionedBundleWithManifest,
    collectContents: SinonSpy,
    fetchTarball: SinonSpy
): void {
    assert.strictEqual(result.alreadyPublishedAsLatest, false);
    if (result.previousReleaseArtifacts.isNothing) {
        assert.fail('expected previousReleaseArtifacts to be present');
    }
    assertPreviousReleaseArtifacts(result.previousReleaseArtifacts.value, 1);
    assert.deepStrictEqual(collectContents.firstCall.args, [ bundle, 'package', undefined ]);
    assert.deepStrictEqual(fetchTarball.firstCall.args, [
        latestReleaseMetadata.tarballAddress,
        latestReleaseMetadata.tarballIntegrity,
        registrySettings
    ]);
}

export function assertMatchingContentsResult(
    result: BundlePublishedCheckResult,
    collectContents: SinonSpy,
    fetchTarball: SinonSpy
): void {
    assert.strictEqual(result.alreadyPublishedAsLatest, true);
    if (result.previousReleaseArtifacts.isNothing) {
        assert.fail('expected previousReleaseArtifacts to be present');
    }
    assertPreviousReleaseArtifacts(result.previousReleaseArtifacts.value);
    assert.deepStrictEqual(collectContents.firstCall.args[1], 'package');
    assert.deepStrictEqual(fetchTarball.firstCall.args, [
        latestReleaseMetadata.tarballAddress,
        latestReleaseMetadata.tarballIntegrity,
        registrySettings
    ]);
}

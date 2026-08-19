import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { fakeCheckRunner } from '../test-libraries/check-fixtures.ts';
import {
    bundleResource,
    linkedBundle,
    versionedBundleWithManifest,
    type BundleFixtureLinkedBundle,
    type BundleFixtureVersionedBundleWithManifest
} from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import {
    createTestProgressBroadcaster,
    getErrResult,
    getOkResult,
    type TestProgressBroadcaster
} from '../test-libraries/result-helpers.ts';
import { createPacktory, type Packtory, type PacktoryDependencies } from './packtory.ts';
import { createScheduler } from './scheduler.ts';

type ArtifactCollectBundle = {
    readonly name: string;
};
type ResolvePackageInput = {
    readonly name: string;
};
type TreePacktoryFixture = {
    readonly addVersion: SinonSpy;
    readonly packtory: Packtory;
    readonly progressBroadcaster: TestProgressBroadcaster;
};
type ArtifactReportMode = 'entries' | 'none' | 'package-only';
type SubscriberVisibility = 'normal' | 'suppress-inputs';

function createConfig(): Record<string, unknown> {
    return {
        commonPackageSettings: {
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: [ { name: 'package-a', roots: { main: { js: 'package-a/index.js' } } } ]
    };
}

function createLinkedPackage(name: string): BundleFixtureLinkedBundle {
    return linkedBundle({
        name,
        contents: [
            {
                ...bundleResource(`/${name}/index.js`, { targetFilePath: 'index.js' }),
                isSubstituted: false
            }
        ],
        roots: {
            main: {
                js: {
                    sourceFilePath: `/${name}/index.js`,
                    targetFilePath: 'index.js',
                    content: '',
                    isExecutable: false
                }
            }
        }
    });
}

function createVersionedPackage(name: string): BundleFixtureVersionedBundleWithManifest {
    return versionedBundleWithManifest({
        name,
        version: '0.0.0',
        mainFile: { sourceFilePath: `/${name}/index.js`, targetFilePath: 'index.js' },
        packageJson: { name, version: '0.0.0' },
        manifestFile: { filePath: 'package.json', content: '{}' }
    });
}

function createArtifactCollector(
    progressBroadcaster: TestProgressBroadcaster,
    mode: ArtifactReportMode
): PacktoryDependencies['artifactsBuilder']['collectContents'] {
    return function collectContents(bundle) {
        if (mode !== 'entries') {
            return [];
        }
        const { name } = bundle as ArtifactCollectBundle;
        progressBroadcaster.provider.emit('artifactsCollected', {
            packageName: name,
            entries: [
                {
                    path: 'package.json',
                    sizeBytes: 2,
                    kind: 'manifest',
                    status: 'generated',
                    badges: []
                }
            ]
        });
        return [];
    };
}

function createAddVersion(
    progressBroadcaster: TestProgressBroadcaster,
    mode: ArtifactReportMode
): SinonSpy {
    return fake(function () {
        if (mode === 'package-only') {
            progressBroadcaster.provider.emit('packageJsonAssembled', {
                packageName: 'package-a',
                fields: {}
            });
        }
        return createVersionedPackage('package-a');
    });
}

function withSubscriberVisibility(
    progressBroadcaster: TestProgressBroadcaster,
    visibility: SubscriberVisibility
): TestProgressBroadcaster {
    return {
        consumer: progressBroadcaster.consumer,
        provider: {
            emit(eventName, payload) {
                progressBroadcaster.provider.emit(eventName, payload);
            },
            hasSubscribers(eventName) {
                if (visibility === 'suppress-inputs' && eventName === 'inputsResolved') {
                    return false;
                }
                return progressBroadcaster.provider.hasSubscribers(eventName);
            }
        }
    };
}

function createTreePacktory(mode: ArtifactReportMode, visibility: SubscriberVisibility): TreePacktoryFixture {
    const progressBroadcaster = withSubscriberVisibility(createTestProgressBroadcaster(), visibility);
    const addVersion = createAddVersion(progressBroadcaster, mode);
    const resolveAndLink = fake(async function (options: ResolvePackageInput) {
        return createLinkedPackage(options.name);
    });
    const unusedPacktoryMethod = fake.rejects(new Error('unused packtory method'));

    return {
        addVersion,
        progressBroadcaster,
        packtory: createPacktory({
            packageProcessor: {
                resolveAndLink,
                resolveAndLinkWithPromotedDeclarationCompanions: resolveAndLink,
                tryBuildAndPublish: unusedPacktoryMethod,
                buildAndPublish: unusedPacktoryMethod,
                build: unusedPacktoryMethod as never
            },
            scheduler: createScheduler({ progressBroadcastProvider: progressBroadcaster.provider }),
            deadCodeEliminator: createTestEliminator(),
            progressBroadcaster,
            artifactsBuilder: { collectContents: createArtifactCollector(progressBroadcaster, mode) },
            fileManager: {
                checkDirectory: fake.resolves({ exists: true, isDirectory: true }),
                checkReadability: fake.resolves({ isReadable: true }),
                readFile: fake.resolves('')
            },
            repositoryFolder: '/',
            versionManager: {
                addVersion: addVersion as never,
                increaseVersion: fake.throws(new Error('unused increaseVersion')) as never
            },
            runChecks: fakeCheckRunner(),
            packEmitter: { pack: unusedPacktoryMethod as never },
            vendorMaterializer: { materializeExternals: unusedPacktoryMethod as never },
            async readCurrentGitHead() {
                return undefined;
            }
        })
    };
}

suite('packtory package tree facade', function () {
    test('inspectPackageDependencies() returns config issues when the config is invalid', async function () {
        const { packtory } = createTreePacktory('entries', 'normal');

        const { result } = await packtory.inspectPackageDependencies({ invalid: true }, 'package-a');

        const error = getErrResult(result, 'Expected inspectPackageDependencies() should fail but it did not');
        assert.strictEqual(error.type, 'config');
    });

    test('inspectPackageDependencies() returns dependency reasons for a configured package', async function () {
        const { packtory } = createTreePacktory('entries', 'normal');

        const { result } = await packtory.inspectPackageDependencies(createConfig(), 'package-a');

        assert.deepStrictEqual(
            getOkResult(result, 'Expected inspectPackageDependencies() should succeed'),
            { packageName: 'package-a', dependencies: [] }
        );
    });

    test('inspectPackageTree() returns config issues when the config is invalid', async function () {
        const { packtory } = createTreePacktory('entries', 'normal');

        const { result } = await packtory.inspectPackageTree({ invalid: true }, 'package-a');

        const error = getErrResult(result, 'Expected inspectPackageTree() should fail but it did not');
        assert.strictEqual(error.type, 'config');
    });

    test('inspectPackageTree() returns artifact report entries and removes subscribers', async function () {
        const { addVersion, packtory, progressBroadcaster } = createTreePacktory('entries', 'normal');

        const { result } = await packtory.inspectPackageTree(createConfig(), 'package-a');

        assert.deepStrictEqual(
            getOkResult(result, 'Expected inspectPackageTree() should succeed'),
            {
                packageName: 'package-a',
                entries: [
                    {
                        path: 'package.json',
                        sizeBytes: 2,
                        kind: 'manifest',
                        status: 'generated',
                        badges: []
                    }
                ]
            }
        );
        assert.strictEqual(addVersion.callCount, 1);
        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('artifactsCollected'), false);
    });

    test('inspectPackageTree() rejects missing package tree reports', async function () {
        const { packtory } = createTreePacktory('none', 'suppress-inputs');

        await assert.rejects(
            async function inspectTree() {
                await packtory.inspectPackageTree(createConfig(), 'package-a');
            },
            /Package tree report for "package-a" is missing/u
        );
    });

    test('inspectPackageTree() rejects reports without tree outputs', async function () {
        const { packtory } = createTreePacktory('package-only', 'normal');

        await assert.rejects(
            async function inspectTree() {
                await packtory.inspectPackageTree(createConfig(), 'package-a');
            },
            /Package tree outputs for "package-a" are missing/u
        );
    });
});

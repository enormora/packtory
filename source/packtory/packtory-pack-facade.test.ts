import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { fakeCheckRunner } from '../test-libraries/check-fixtures.ts';
import {
    linkedBundle,
    versionedBundleWithManifest,
    type BundleFixtureLinkedBundle,
    type BundleFixtureVersionedBundleWithManifest
} from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createTestProgressBroadcaster, getErrResult, getOkResult } from '../test-libraries/result-helpers.ts';
import { createPacktory, type Packtory, type PacktoryDependencies } from './packtory.ts';

type PackageEntry = {
    readonly name: string;
    readonly roots: { readonly main: { readonly js: string; }; };
};

type StageCreateOptionsContext = {
    readonly packageName: string;
    readonly existing: readonly unknown[];
    readonly config: unknown;
};

type StageSelectNextInput = {
    readonly result: unknown;
    readonly options: unknown;
};

type StageInput = {
    readonly config: { readonly packtoryConfig: { readonly packages: readonly PackageEntry[]; }; };
    readonly createOptions: (context: StageCreateOptionsContext) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (input: StageSelectNextInput) => unknown;
};

type ResolveInput = {
    readonly name: string;
};

type AddVersionInput = {
    readonly bundle: { readonly name: string; };
};

type PackEmitterInput = {
    readonly bundle: unknown;
    readonly format: string;
    readonly extraFiles: readonly unknown[];
    readonly outputPath: string;
    readonly vendorEntries: readonly unknown[];
};

type PackAllFacadeFixture = {
    readonly packEmitterPack: SinonSpy;
    readonly packtory: Packtory;
};

const packageEntries: readonly PackageEntry[] = [
    { name: 'package-a', roots: { main: { js: 'package-a/index.js' } } },
    { name: 'package-b', roots: { main: { js: 'package-b/index.js' } } }
];

function createConfig(): Record<string, unknown> {
    return {
        commonPackageSettings: {
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: packageEntries
    };
}

function createLinkedBundle(name: string): BundleFixtureLinkedBundle {
    return linkedBundle({
        name,
        contents: [],
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

function createVersionedBundle(name: string): BundleFixtureVersionedBundleWithManifest {
    return versionedBundleWithManifest({
        name,
        version: '1.0.0',
        packageJson: { name, version: '1.0.0' },
        manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false }
    });
}

async function runStage(input: StageInput): Promise<Result<unknown[], never>> {
    const existing: unknown[] = [];
    async function runPackage(accumulator: Promise<unknown[]>, packageConfig: PackageEntry): Promise<unknown[]> {
        const results = await accumulator;
        const options = input.createOptions({ packageName: packageConfig.name, existing, config: input.config });
        const result = await input.execute(options);
        existing.push(input.selectNext({ result, options }));

        return [ ...results, result ];
    }

    const results = await input.config.packtoryConfig.packages.reduce(runPackage, Promise.resolve([] as unknown[]));

    return Result.ok(results);
}

function packOutputPaths(packEmitterPack: SinonSpy): readonly string[] {
    return packEmitterPack.args.map(function (call) {
        const options = call[0] as PackEmitterInput;
        return options.outputPath;
    });
}

function firstPackEmitterInput(packEmitterPack: SinonSpy): PackEmitterInput {
    return packEmitterPack.firstCall.args[0] as PackEmitterInput;
}

function createPacktoryForPackAll(packEmitterPack: SinonSpy = fake.resolves(undefined)): PackAllFacadeFixture {
    const resolveAndLink = fake(async function (options: ResolveInput) {
        return createLinkedBundle(options.name);
    });
    const progressBroadcaster = createTestProgressBroadcaster();
    const scheduler: PacktoryDependencies['scheduler'] = { runForEachScheduledPackage: fake(runStage) as never };
    const addVersion = fake(function (input: AddVersionInput) {
        return createVersionedBundle(input.bundle.name);
    });
    return {
        packEmitterPack,
        packtory: createPacktory({
            packageProcessor: {
                resolveAndLink,
                resolveAndLinkWithPromotedDeclarationCompanions: resolveAndLink,
                tryBuildAndPublish: fake.rejects(new Error('unused publish')),
                buildAndPublish: fake.rejects(new Error('unused publish')),
                build: fake.rejects(new Error('unused build')) as never
            },
            scheduler,
            deadCodeEliminator: createTestEliminator(),
            progressBroadcaster,
            artifactsBuilder: { collectContents: fake.returns([]) },
            fileManager: createFakeFileManager({
                simulatedCheckReadabilityResponses: [
                    { value: { isReadable: false } },
                    { value: { isReadable: false } }
                ]
            }),
            repositoryFolder: '/',
            runChecks: fakeCheckRunner(),
            versionManager: {
                addVersion,
                increaseVersion: fake.rejects(new Error('unused version increase')) as never
            },
            packEmitter: { pack: packEmitterPack as never },
            vendorMaterializer: {
                materializeExternals: fake.resolves(
                    Result.ok({
                        entries: [],
                        packageNames: [],
                        peerRequirements: new Map<string, readonly string[]>()
                    })
                )
            },
            async readCurrentGitHead() {
                return undefined;
            }
        })
    };
}

suite('packtory pack facade', function () {
    test('packPackage() returns config issues when the config is invalid', async function () {
        const { packtory } = createPacktoryForPackAll();

        const { result } = await packtory.packPackage(
            { invalid: true },
            {
                packageName: 'package-a',
                format: 'tar',
                outputPath: '/out/package-a.tgz',
                version: '1.0.0',
                vendorDependencies: false
            }
        );

        const error = getErrResult(result, 'Expected packPackage() should fail but it did not');
        assert.strictEqual(error.type, 'config');
    });

    test('packPackage() emits the requested package artifact on success', async function () {
        const packEmitterPack = fake.resolves(undefined);
        const { packtory } = createPacktoryForPackAll(packEmitterPack);

        const { result } = await packtory.packPackage(
            createConfig(),
            {
                packageName: 'package-a',
                format: 'tar',
                outputPath: '/out/package-a.tgz',
                version: '1.0.0',
                vendorDependencies: false
            }
        );

        getOkResult(result, 'Expected packPackage() should succeed');
        assert.deepStrictEqual(firstPackEmitterInput(packEmitterPack), {
            bundle: createVersionedBundle('package-a'),
            format: 'tar',
            outputPath: '/out/package-a.tgz',
            vendorEntries: [],
            extraFiles: []
        });
    });

    test('packAllPackages() returns config issues when the config is invalid', async function () {
        const { packtory } = createPacktoryForPackAll();

        const { result } = await packtory.packAllPackages(
            { invalid: true },
            { outputPath: '/out', version: '1.0.0', vendorDependencies: false }
        );

        const error = getErrResult(result, 'Expected packAllPackages() should fail but it did not');
        assert.strictEqual(error.type, 'config');
    });

    test('packAllPackages() emits every package folder on success', async function () {
        const packEmitterPack = fake.resolves(undefined);
        const { packtory } = createPacktoryForPackAll(packEmitterPack);

        const { result } = await packtory.packAllPackages(
            createConfig(),
            { outputPath: '/out', version: '1.0.0', vendorDependencies: false }
        );

        assert.deepStrictEqual(
            getOkResult(result, 'Expected packAllPackages() should succeed'),
            { packageNames: [ 'package-a', 'package-b' ] }
        );
        assert.deepStrictEqual(
            packOutputPaths(packEmitterPack),
            [ '/out/package-a', '/out/package-b' ]
        );
    });
});

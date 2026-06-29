import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import {
    baseOptions,
    buildDependenciesWith,
    createDeduplicatedBundleClosureScenario,
    createDependencies,
    createTransitiveBundleClosureScenario,
    expectErr,
    makeBareVersionedBundle,
    makeResolvedPackage,
    runVendorAndExpectExtraFiles,
    sortedFilePaths,
    validatedConfig,
    type AddVersionInput,
    type FakeVersionedBundle,
    type RunPackDependenciesFakes,
    type VendorEntryFixture
} from '../test-libraries/packtory-pack-test-support.ts';
import {
    createRunPackValidated,
    type InternalPackFailure,
    type PackRunDependencies
} from './packtory-pack.ts';
import type { InternalResolveAndLinkFailure } from './packtory-resolve.ts';

type MaterializerFailureOutcome = {
    readonly failure: InternalPackFailure;
    readonly emitCallCount: number;
};

type VersionedBundleIdentity = {
    readonly name: string;
    readonly version: string;
};

type ExternalVendoringScenario = {
    readonly dependencies: PackRunDependencies;
    readonly fakes: RunPackDependenciesFakes;
    readonly materializerSpy: SinonSpy;
    readonly vendorEntries: readonly VendorEntryFixture[];
};

function registerVendorFailureTests(): void {
    async function runPackExpectingMaterializerFailure(
        materializerError: unknown,
        externalDependencyName: string
    ): Promise<MaterializerFailureOutcome> {
        const materializerSpy = fake.resolves(Result.err(materializerError));
        const { dependencies, fakes } = createDependencies({
            materializerSpy,
            resolveResult: Result.ok([
                makeResolvedPackage({
                    externalDependencyNames: [ externalDependencyName ],
                    sourcesFolder: '/repo/source'
                })
            ])
        });
        const runPack = createRunPackValidated(dependencies);
        const result = await runPack(
            validatedConfig,
            { ...baseOptions, vendorDependencies: true },
            fakes.resolveAndLinkAll
        );
        return { failure: expectErr(result), emitCallCount: fakes.packEmitterPack.callCount };
    }

    test('maps a vendor symlink-target-outside-package failure to the corresponding pack failure and never emits an artifact', async function () {
        const outcome = await runPackExpectingMaterializerFailure(
            {
                type: 'symlink-target-outside-package',
                packageName: 'evil',
                entryRelativePath: 'leak.json',
                resolvedTargetPath: '/Users/victim/.npmrc'
            },
            'evil'
        );

        assert.deepStrictEqual(outcome.failure, {
            type: 'vendor-symlink-target-outside-package',
            packageName: 'pkg-a',
            vendoredPackageName: 'evil',
            entryRelativePath: 'leak.json',
            resolvedTargetPath: '/Users/victim/.npmrc'
        });
        assert.strictEqual(outcome.emitCallCount, 0);
    });

    test('maps a vendor invalid-dependency-name failure to the corresponding pack failure and never emits an artifact', async function () {
        const outcome = await runPackExpectingMaterializerFailure(
            {
                type: 'invalid-dependency-name',
                sourcePackageName: 'legit-utils',
                invalidDependencyName: '../../legit-utils'
            },
            'legit-utils'
        );

        assert.deepStrictEqual(outcome.failure, {
            type: 'vendor-invalid-dependency-name',
            packageName: 'pkg-a',
            sourcePackageName: 'legit-utils',
            invalidDependencyName: '../../legit-utils'
        });
        assert.strictEqual(outcome.emitCallCount, 0);
    });
}

function registerVendorPackTests(): void {
    test('aggregates peer requirements from both the bundle-dep closure and the external vendor closure', async function () {
        const versionedTarget = makeBareVersionedBundle('pkg-a');
        const versionedShared: FakeVersionedBundle = {
            ...makeBareVersionedBundle('shared'),
            peerDependencies: { 'styled-components': '^6.0.0' }
        };
        const addVersion = fake(function (options: AddVersionInput) {
            return options.bundle.name === 'shared' ? versionedShared : versionedTarget;
        });
        const packEmitterPack = fake.resolves(undefined);
        const resolveAndLinkAll = fake.resolves(Result.ok([
            makeResolvedPackage({ bundleDependencyNames: [ 'shared' ] }),
            makeResolvedPackage({ name: 'shared' })
        ]));
        const runPack = createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack));

        const result = await runPack(validatedConfig, { ...baseOptions, vendorDependencies: true }, resolveAndLinkAll);

        assert.deepStrictEqual(expectErr(result), {
            type: 'peer-dependencies-unsatisfied',
            packageName: 'pkg-a',
            items: [ { packageName: 'shared', peer: 'styled-components' } ]
        });
    });

    function assertSuccessfulPackEmit(
        fakes: RunPackDependenciesFakes,
        versionedBundle: VersionedBundleIdentity
    ): void {
        assert.strictEqual(fakes.versionManagerAddVersion.callCount, 1);
        const args = fakes.versionManagerAddVersion.firstCall.args as readonly unknown[];
        const addVersionOptions = args[0] as {
            readonly version: string;
            readonly bundleDependencies: readonly unknown[];
            readonly bundlePeerDependencies: readonly unknown[];
        };
        assert.strictEqual(addVersionOptions.version, '1.2.3');
        assert.deepStrictEqual(addVersionOptions.bundleDependencies, []);
        assert.deepStrictEqual(addVersionOptions.bundlePeerDependencies, []);
        assert.deepStrictEqual(fakes.packEmitterPack.firstCall.args, [
            {
                bundle: versionedBundle,
                format: 'tar',
                outputPath: '/out/pkg-a.tgz',
                vendorEntries: [],
                extraFiles: []
            }
        ]);
    }

    test('builds a versioned bundle and emits it via the pack emitter on success', async function () {
        const versionedBundle = { name: 'pkg-a', version: '1.2.3' };
        const { dependencies, fakes } = createDependencies({ versionedBundle });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(
            validatedConfig,
            { ...baseOptions, version: '1.2.3', format: 'tar', outputPath: '/out/pkg-a.tgz' },
            fakes.resolveAndLinkAll
        );

        assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
        assertSuccessfulPackEmit(fakes, versionedBundle);
    });

    test('falls back to the original manifest unchanged when vendoring is on but the manifest content is not a JSON object', async function () {
        const malformedContent = JSON.stringify([ 'unexpected', 'array' ]);
        const versionedBundle = {
            name: 'pkg-a',
            version: '0.0.0',
            manifestFile: { content: malformedContent, isExecutable: false, filePath: 'package.json' }
        };
        const { dependencies, fakes } = createDependencies({ versionedBundle });
        const result = await createRunPackValidated(dependencies)(
            validatedConfig,
            { ...baseOptions, vendorDependencies: true },
            fakes.resolveAndLinkAll
        );

        assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
        const emitted = fakes.packEmitterPack.firstCall.args[0] as {
            readonly bundle: { readonly manifestFile: { readonly content: string; }; };
        };
        assert.strictEqual(emitted.bundle.manifestFile.content, malformedContent);
    });

    function createExternalVendoringScenario(): ExternalVendoringScenario {
        const versionedBundle = {
            name: 'pkg-a',
            version: '0.0.0',
            manifestFile: {
                content: JSON.stringify({
                    name: 'pkg-a',
                    version: '0.0.0',
                    dependencies: { 'left-pad': '1.0.0' },
                    peerDependencies: { react: '18.0.0' }
                }),
                isExecutable: false,
                filePath: 'package.json'
            }
        };
        const vendorEntries: readonly VendorEntryFixture[] = [
            {
                sourceAbsolutePath: '/repo/node_modules/left-pad/index.js',
                sourcePackageRootPath: '/repo/node_modules/left-pad',
                targetRelativePath: 'node_modules/left-pad/index.js',
                isExecutable: false
            }
        ];
        const materializerSpy = fake.resolves(
            Result.ok({
                entries: vendorEntries,
                packageNames: [ 'left-pad' ],
                peerRequirements: new Map<string, readonly string[]>()
            })
        );
        const { dependencies, fakes } = createDependencies({
            versionedBundle,
            materializerSpy,
            resolveResult: Result.ok([
                makeResolvedPackage({
                    externalDependencyNames: [ 'left-pad' ],
                    sourcesFolder: '/repo/source'
                })
            ])
        });
        return { dependencies, fakes, materializerSpy, vendorEntries };
    }

    function assertExternalVendoringResult(
        materializerSpy: SinonSpy,
        fakes: RunPackDependenciesFakes,
        vendorEntries: readonly VendorEntryFixture[]
    ): void {
        assert.strictEqual(materializerSpy.callCount, 1);
        assert.deepStrictEqual(materializerSpy.firstCall.args, [
            { initialDependencyNames: [ 'left-pad' ], projectFolder: '/repo/source' }
        ]);
        const emitArgs = fakes.packEmitterPack.firstCall.args as readonly unknown[];
        const emitOptions = emitArgs[0] as {
            readonly bundle: { readonly manifestFile: { readonly content: string; }; };
            readonly vendorEntries: readonly unknown[];
        };
        const slimManifest = JSON.parse(emitOptions.bundle.manifestFile.content) as Record<string, unknown>;
        assert.strictEqual(Object.hasOwn(slimManifest, 'dependencies'), false);
        assert.strictEqual(Object.hasOwn(slimManifest, 'peerDependencies'), false);
        assert.strictEqual(slimManifest.name, 'pkg-a');
        assert.deepStrictEqual(emitOptions.vendorEntries, vendorEntries);
    }

    test('materializes externals and strips dependencies + peerDependencies from the manifest when vendorDependencies is enabled', async function () {
        const { dependencies, fakes, materializerSpy, vendorEntries } = createExternalVendoringScenario();
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(
            validatedConfig,
            { ...baseOptions, vendorDependencies: true },
            fakes.resolveAndLinkAll
        );

        assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
        assertExternalVendoringResult(materializerSpy, fakes, vendorEntries);
    });

    test('preserves top-level package.json exports and imports arrays while still sorting other arrays when vendoring is enabled', async function () {
        const versionedBundle = {
            name: 'pkg-a',
            version: '0.0.0',
            manifestFile: {
                content: JSON.stringify({
                    name: 'pkg-a',
                    exports: [ './second.js', './first.js' ],
                    files: [ './z.js', './a.js' ],
                    imports: {
                        '#alias': [ './third.js', './first.js' ]
                    }
                }),
                isExecutable: false,
                filePath: 'package.json'
            }
        };
        const { dependencies, fakes } = createDependencies({ versionedBundle });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(
            validatedConfig,
            { ...baseOptions, vendorDependencies: true },
            fakes.resolveAndLinkAll
        );

        assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
        const emitOptions = fakes.packEmitterPack.firstCall.args[0] as {
            readonly bundle: { readonly manifestFile: { readonly content: string; }; };
        };
        const manifest = JSON.parse(emitOptions.bundle.manifestFile.content) as {
            readonly exports: readonly string[];
            readonly files: readonly string[];
            readonly imports: Readonly<Record<string, readonly string[]>>;
        };
        assert.deepStrictEqual(manifest.exports, [ './second.js', './first.js' ]);
        assert.deepStrictEqual(manifest.files, [ './a.js', './z.js' ]);
        assert.deepStrictEqual(manifest.imports['#alias'], [ './third.js', './first.js' ]);
    });
}

suite('packtory-pack', function () {
    test('passes the resolve-and-link failure through unchanged when resolve fails', async function () {
        const resolveFailure: InternalResolveAndLinkFailure = { type: 'checks', issues: [ 'boom' ] };
        const { dependencies, fakes } = createDependencies({ resolveResult: Result.err(resolveFailure) });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(validatedConfig, baseOptions, fakes.resolveAndLinkAll);

        const error = expectErr(result);
        assert.deepStrictEqual(error, resolveFailure);
    });

    test('returns a package-not-found failure when no resolved package matches the requested name', async function () {
        const { dependencies, fakes } = createDependencies({
            resolveResult: Result.ok([ makeResolvedPackage({ name: 'pkg-other' }) ])
        });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(validatedConfig, baseOptions, fakes.resolveAndLinkAll);

        assert.deepStrictEqual(expectErr(result), { type: 'package-not-found', packageName: 'pkg-a' });
    });

    test('returns a bundle-dependencies-unsupported failure when the target package declares bundle dependencies in non-vendor mode', async function () {
        const { dependencies, fakes } = createDependencies({
            resolveResult: Result.ok([ makeResolvedPackage({ bundleDependencies: [ { name: 'dep' } ] }) ])
        });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(validatedConfig, baseOptions, fakes.resolveAndLinkAll);

        assert.deepStrictEqual(expectErr(result), { type: 'bundle-dependencies-unsupported', packageName: 'pkg-a' });
    });

    test('materializes a transitive bundle dependency closure as node_modules/<dep>/ extras when vendoring is enabled', async function () {
        const { runPack, resolveAndLinkAll, packEmitterPack } = createTransitiveBundleClosureScenario();

        const extraFiles = await runVendorAndExpectExtraFiles(runPack, resolveAndLinkAll, packEmitterPack);
        const sortedPaths = sortedFilePaths(extraFiles);
        assert.deepStrictEqual(sortedPaths, [
            'node_modules/shared/index.js',
            'node_modules/shared/package.json',
            'node_modules/tooling/lib.js',
            'node_modules/tooling/package.json'
        ]);
    });

    test('deduplicates bundle dependencies that are reachable through multiple paths in the closure', async function () {
        const { runPack, resolveAndLinkAll, packEmitterPack } = createDeduplicatedBundleClosureScenario();

        await runPack(validatedConfig, { ...baseOptions, vendorDependencies: true }, resolveAndLinkAll);

        const emitOptions = packEmitterPack.firstCall.args[0] as {
            readonly extraFiles: readonly { readonly filePath: string; }[];
        };
        const sharedEntries = emitOptions.extraFiles.filter(function (entry) {
            return entry.filePath.startsWith('node_modules/shared/');
        });
        // Each package contributes its manifest; 'shared' has no other content so exactly one entry.
        assert.strictEqual(sharedEntries.length, 1);
    });

    test('silently skips bundle dependencies whose names are not present in the resolved package list', async function () {
        const versionedBundle: FakeVersionedBundle = {
            name: 'pkg-a',
            version: '0.0.0',
            manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' },
            contents: [],
            peerDependencies: {}
        };
        const addVersion = fake.returns(versionedBundle);
        const packEmitterPack = fake.resolves(undefined);
        // target references 'missing' as a bundle dependency, but it's not in the resolve list
        const target = makeResolvedPackage({ bundleDependencyNames: [ 'missing' ] });
        const resolveAndLinkAll = fake.resolves(Result.ok([ target ]));
        const runPack = createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack));

        const extraFiles = await runVendorAndExpectExtraFiles(runPack, resolveAndLinkAll, packEmitterPack);
        assert.deepStrictEqual(extraFiles, []);
    });

    test('returns a peer-dependencies-unsatisfied failure listing only the peers that are missing from the closure', async function () {
        // 'react' is in the closure (satisfied), 'react-router' is not (unsatisfied).
        const materializerSpy = fake.resolves(
            Result.ok({
                entries: [],
                packageNames: [ 'react-dom', 'react' ],
                peerRequirements: new Map<string, readonly string[]>([ [ 'react-dom', [ 'react', 'react-router' ] ] ])
            })
        );
        const { dependencies, fakes } = createDependencies({
            materializerSpy,
            resolveResult: Result.ok([
                makeResolvedPackage({ externalDependencyNames: [ 'react-dom' ], sourcesFolder: '/repo/source' })
            ])
        });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(
            validatedConfig,
            { ...baseOptions, vendorDependencies: true },
            fakes.resolveAndLinkAll
        );

        assert.deepStrictEqual(expectErr(result), {
            type: 'peer-dependencies-unsatisfied',
            packageName: 'pkg-a',
            items: [ { packageName: 'react-dom', peer: 'react-router' } ]
        });
        assert.strictEqual(fakes.packEmitterPack.callCount, 0);
    });

    registerVendorFailureTests();
    registerVendorPackTests();
});

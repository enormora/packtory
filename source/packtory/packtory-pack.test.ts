import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { vendorMaterializerFailureType } from '../vendor-materializer/vendor-materializer.ts';
import {
    baseOptions,
    buildDependenciesWith,
    createDeduplicatedBundleClosureScenario,
    createDependencies,
    createTransitiveBundleClosureScenario,
    expectErr,
    makeResolvedPackage,
    packEmitterInput,
    runVendorAndExpectExtraFiles,
    sortedFilePaths,
    validatedConfig,
    type CreatedDependencies,
    type FakeVersionedBundle
} from '../test-libraries/packtory-pack-test-support.ts';
import { createRunPackValidated } from './packtory-pack.ts';
import type { InternalResolveAndLinkFailure } from './packtory-resolve.ts';

async function runVendoredPackage(fixture: CreatedDependencies): ReturnType<ReturnType<typeof createRunPackValidated>> {
    const runPack = createRunPackValidated(fixture.dependencies);
    return runPack(
        validatedConfig,
        { ...baseOptions, vendorDependencies: true },
        fixture.fakes.resolveAndLinkAll
    );
}

async function runVendoredPackageWithManifest(content: string): Promise<{
    readonly fixture: CreatedDependencies;
    readonly result: Awaited<ReturnType<ReturnType<typeof createRunPackValidated>>>;
}> {
    const fixture = createDependencies({
        versionedBundle: {
            name: 'pkg-a',
            version: '0.0.0',
            manifestFile: {
                content,
                isExecutable: false,
                filePath: 'package.json'
            },
            contents: [],
            peerDependencies: {}
        }
    });
    return { fixture, result: await runVendoredPackage(fixture) };
}

function createVendorFailureDependencies(failure: unknown): CreatedDependencies {
    return createDependencies({
        materializerSpy: fake.resolves(Result.err(failure)),
        resolveResult: Result.ok([
            makeResolvedPackage({ externalDependencyNames: [ 'dep' ], sourcesFolder: '/repo/source' })
        ])
    });
}

suite('packtory-pack', function () {
    suite('direct pack', function () {
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

            assert.deepStrictEqual(expectErr(result), {
                type: 'bundle-dependencies-unsupported',
                packageName: 'pkg-a'
            });
        });

        test('packs the requested package with resolved bundle metadata when vendoring is disabled', async function () {
            const { dependencies, fakes } = createDependencies({});
            const runPack = createRunPackValidated(dependencies);

            const result = await runPack(validatedConfig, baseOptions, fakes.resolveAndLinkAll);

            assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
            assert.deepStrictEqual(fakes.versionManagerAddVersion.firstCall.args[0], {
                bundle: makeResolvedPackage().analyzedBundle,
                version: '0.0.0',
                mainPackageJson: { type: 'module' },
                bundleDependencies: [],
                bundlePeerDependencies: [],
                additionalPackageJsonAttributes: {},
                allowMutableSpecifiers: []
            });
            const versionedBundle = fakes.versionManagerAddVersion.firstCall.returnValue as unknown;
            assert.deepStrictEqual(fakes.packEmitterPack.firstCall.args[0], {
                bundle: versionedBundle,
                format: 'zip',
                outputPath: '/out/pkg-a.zip',
                vendorEntries: [],
                extraFiles: []
            });
        });
    });

    suite('vendoring', function () {
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
            const target = makeResolvedPackage({ bundleDependencyNames: [ 'missing' ] });
            const resolveAndLinkAll = fake.resolves(Result.ok([ target ]));
            const runPack = createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack));

            const extraFiles = await runVendorAndExpectExtraFiles(runPack, resolveAndLinkAll, packEmitterPack);
            assert.deepStrictEqual(extraFiles, []);
        });

        test('strips vendored manifest dependencies while preserving package export and import array order', async function () {
            const { fixture, result } = await runVendoredPackageWithManifest(JSON.stringify({
                name: 'pkg-a',
                dependencies: { left: '1.0.0' },
                peerDependencies: { right: '1.0.0' },
                exports: [ './z.js', './a.js' ],
                imports: [ '#z', '#a' ],
                keywords: [ 'z', 'a' ]
            }));

            assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
            assert.deepStrictEqual(
                JSON.parse(packEmitterInput(fixture.fakes.packEmitterPack).bundle.manifestFile.content),
                {
                    exports: [ './z.js', './a.js' ],
                    imports: [ '#z', '#a' ],
                    keywords: [ 'a', 'z' ],
                    name: 'pkg-a'
                }
            );
        });

        test('keeps the original vendored manifest when it is not a JSON object', async function () {
            const { fixture, result } = await runVendoredPackageWithManifest('[]');

            assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
            assert.strictEqual(packEmitterInput(fixture.fakes.packEmitterPack).bundle.manifestFile.content, '[]');
        });

        test('returns a peer-dependencies-unsatisfied failure listing only the peers that are missing from the closure', async function () {
            const materializerSpy = fake.resolves(
                Result.ok({
                    entries: [],
                    packageNames: [ 'react-dom', 'react' ],
                    peerRequirements: new Map<string, readonly string[]>([ [ 'react-dom', [
                        'react',
                        'react-router'
                    ] ] ])
                })
            );
            const { dependencies, fakes } = createDependencies({
                materializerSpy,
                resolveResult: Result.ok([
                    makeResolvedPackage({ externalDependencyNames: [ 'react-dom' ], sourcesFolder: '/repo/source' })
                ])
            });

            const result = await runVendoredPackage({ dependencies, fakes });

            assert.deepStrictEqual(expectErr(result), {
                type: 'peer-dependencies-unsatisfied',
                packageName: 'pkg-a',
                items: [ { packageName: 'react-dom', peer: 'react-router' } ]
            });
            assert.strictEqual(fakes.packEmitterPack.callCount, 0);
        });

        test('passes external dependency names and source folder into the vendor materializer', async function () {
            const materializerSpy = fake.resolves(
                Result.ok({
                    entries: [],
                    packageNames: [],
                    peerRequirements: new Map<string, readonly string[]>()
                })
            );
            const { dependencies, fakes } = createDependencies({
                materializerSpy,
                resolveResult: Result.ok([
                    makeResolvedPackage({
                        externalDependencyNames: [ 'react', 'react-dom' ],
                        sourcesFolder: '/repo/packages/pkg-a'
                    })
                ])
            });

            const result = await runVendoredPackage({ dependencies, fakes });

            assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
            assert.deepStrictEqual(materializerSpy.firstCall.args[0], {
                initialDependencyNames: [ 'react', 'react-dom' ],
                projectFolder: '/repo/packages/pkg-a'
            });
        });

        test('maps invalid vendored dependency names to package failures', async function () {
            const { dependencies, fakes } = createVendorFailureDependencies({
                type: vendorMaterializerFailureType.invalidDependencyName,
                sourcePackageName: 'dep',
                invalidDependencyName: 'github:user/repo'
            });

            const result = await runVendoredPackage({ dependencies, fakes });

            assert.deepStrictEqual(expectErr(result), {
                type: 'vendor-invalid-dependency-name',
                packageName: 'pkg-a',
                sourcePackageName: 'dep',
                invalidDependencyName: 'github:user/repo'
            });
            assert.strictEqual(fakes.packEmitterPack.callCount, 0);
        });

        test('maps vendored symlinks that escape the package to package failures', async function () {
            const { dependencies, fakes } = createVendorFailureDependencies({
                type: vendorMaterializerFailureType.symlinkTargetOutsidePackage,
                packageName: 'dep',
                entryRelativePath: 'bin/dep',
                resolvedTargetPath: '/repo/outside.js'
            });

            const result = await runVendoredPackage({ dependencies, fakes });

            assert.deepStrictEqual(expectErr(result), {
                type: 'vendor-symlink-target-outside-package',
                packageName: 'pkg-a',
                vendoredPackageName: 'dep',
                entryRelativePath: 'bin/dep',
                resolvedTargetPath: '/repo/outside.js'
            });
            assert.strictEqual(fakes.packEmitterPack.callCount, 0);
        });
    });
});

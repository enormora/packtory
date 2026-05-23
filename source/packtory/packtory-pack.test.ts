import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import type { PackEmitter } from '../pack-emitter/pack-emitter.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import {
    createRunPackValidated,
    type InternalPackFailure,
    type PackOptions,
    type PackRunDependencies
} from './packtory-pack.ts';
import type { InternalResolveAndLinkFailure } from './packtory-resolve.ts';
import type { ResolvedPackage } from './resolved-package.ts';

const validatedConfig = {} as unknown as ValidConfigWithoutRegistryResult;

type FakeVersionedBundle = {
    readonly name: string;
    readonly version: string;
    readonly manifestFile: { readonly content: string; readonly isExecutable: boolean; readonly filePath: string };
    readonly contents: readonly {
        readonly fileDescription: {
            readonly targetFilePath: string;
            readonly content: string;
            readonly isExecutable: boolean;
        };
    }[];
    readonly peerDependencies: Readonly<Record<string, string>>;
};

const baseOptions: PackOptions = {
    packageName: 'pkg-a',
    format: 'zip',
    outputPath: '/out/pkg-a.zip',
    version: '0.0.0',
    vendorDependencies: false
};

function makeResolvedPackage(
    overrides: {
        readonly name?: string;
        readonly bundleDependencies?: readonly unknown[];
        readonly externalDependencyNames?: readonly string[];
        readonly bundleDependencyNames?: readonly string[];
        readonly sourcesFolder?: string;
        readonly contents?: readonly unknown[];
    } = {}
): ResolvedPackage {
    const externalDependencies = new Map(
        (overrides.externalDependencyNames ?? []).map((name) => {
            return [name, { name, referencedFrom: ['/x'] as const }];
        })
    );
    const linkedBundleDependencies = new Map(
        (overrides.bundleDependencyNames ?? []).map((name) => {
            return [name, { name, referencedFrom: ['/x'] as const }];
        })
    );
    const packageName = overrides.name ?? 'pkg-a';
    return {
        name: packageName,
        analyzedBundle: {
            name: packageName,
            contents: overrides.contents ?? [],
            externalDependencies,
            linkedBundleDependencies
        } as unknown as ResolvedPackage['analyzedBundle'],
        resolveOptions: {
            mainPackageJson: { type: 'module' },
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            bundleDependencies: overrides.bundleDependencies ?? [],
            bundlePeerDependencies: [],
            roots: { main: { js: 'index.js' } },
            surface: { kind: 'implicit' },
            sourcesFolder: overrides.sourcesFolder ?? '/repo'
        } as unknown as ResolvedPackage['resolveOptions']
    };
}

type RunPackDependenciesFakes = {
    readonly versionManagerAddVersion: SinonSpy;
    readonly packEmitterPack: SinonSpy;
    readonly resolveAndLinkAll: SinonSpy;
};

function createDependencies(overrides: {
    readonly versionedBundle?: unknown;
    readonly resolveResult?: Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>;
    readonly materializerSpy?: SinonSpy;
    readonly vendorEntries?: readonly {
        readonly sourceAbsolutePath: string;
        readonly targetRelativePath: string;
        readonly isExecutable: boolean;
    }[];
}): { readonly dependencies: PackRunDependencies; readonly fakes: RunPackDependenciesFakes } {
    const versionedBundle = overrides.versionedBundle ?? {
        name: 'pkg-a',
        version: '0.0.0',
        manifestFile: {
            content: JSON.stringify({
                name: 'pkg-a',
                dependencies: { left: '1.0.0' },
                peerDependencies: { right: '1.0.0' }
            }),
            isExecutable: false,
            filePath: 'package.json'
        }
    };
    const versionManagerAddVersion = fake.returns(versionedBundle);
    const packEmitterPack = fake.resolves(undefined);
    const versionManager: VersionManager = {
        addVersion: versionManagerAddVersion as unknown as VersionManager['addVersion'],
        increaseVersion: fake.returns(versionedBundle) as unknown as VersionManager['increaseVersion']
    };
    const packEmitter: PackEmitter = {
        pack: packEmitterPack as unknown as PackEmitter['pack']
    };
    const resolveAndLinkAll = fake.resolves(overrides.resolveResult ?? Result.ok([makeResolvedPackage()]));
    const materializeExternals =
        overrides.materializerSpy ??
        fake.resolves(
            Result.ok({
                entries: overrides.vendorEntries ?? [],
                packageNames: [],
                peerRequirements: new Map<string, readonly string[]>()
            })
        );
    const vendorMaterializer = {
        materializeExternals:
            materializeExternals as unknown as PackRunDependencies['vendorMaterializer']['materializeExternals']
    };
    return {
        dependencies: { versionManager, packEmitter, vendorMaterializer },
        fakes: { versionManagerAddVersion, packEmitterPack, resolveAndLinkAll }
    };
}

function expectErr(result: Result<undefined, InternalPackFailure>): InternalPackFailure {
    if (result.isOk) {
        assert.fail('expected Err result');
    }
    return result.error;
}

function buildDependenciesWith(
    addVersionFake: SinonSpy,
    packEmitterPackFake: SinonSpy,
    materializerOverride?: SinonSpy
): PackRunDependencies {
    return {
        versionManager: {
            addVersion: addVersionFake as never,
            increaseVersion: fake() as never
        },
        packEmitter: { pack: packEmitterPackFake as never },
        vendorMaterializer: {
            materializeExternals: (materializerOverride ??
                fake.resolves(
                    Result.ok({
                        entries: [],
                        packageNames: [],
                        peerRequirements: new Map<string, readonly string[]>()
                    })
                )) as never
        }
    };
}

function makeBareVersionedBundle(name: string): FakeVersionedBundle {
    return {
        name,
        version: '0.0.0',
        manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' },
        contents: [],
        peerDependencies: {}
    };
}

async function runVendorAndExpectExtraFiles(
    runPack: ReturnType<typeof createRunPackValidated>,
    resolveAndLinkAll: SinonSpy,
    packEmitterPack: SinonSpy
): Promise<readonly { readonly filePath: string; readonly content: string }[]> {
    const result = await runPack(validatedConfig, { ...baseOptions, vendorDependencies: true }, resolveAndLinkAll);
    assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
    const emitOptions = packEmitterPack.firstCall.args[0] as {
        readonly extraFiles: readonly { readonly filePath: string; readonly content: string }[];
    };
    return emitOptions.extraFiles;
}

suite('packtory-pack', function () {
    test('passes the resolve-and-link failure through unchanged when resolve fails', async function () {
        const resolveFailure: InternalResolveAndLinkFailure = { type: 'checks', issues: ['boom'] };
        const { dependencies, fakes } = createDependencies({ resolveResult: Result.err(resolveFailure) });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(validatedConfig, baseOptions, fakes.resolveAndLinkAll);

        const error = expectErr(result);
        assert.deepStrictEqual(error, resolveFailure);
    });

    test('returns a package-not-found failure when no resolved package matches the requested name', async function () {
        const { dependencies, fakes } = createDependencies({
            resolveResult: Result.ok([makeResolvedPackage({ name: 'pkg-other' })])
        });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(validatedConfig, baseOptions, fakes.resolveAndLinkAll);

        assert.deepStrictEqual(expectErr(result), { type: 'package-not-found', packageName: 'pkg-a' });
    });

    test('returns a bundle-dependencies-unsupported failure when the target package declares bundle dependencies in non-vendor mode', async function () {
        const { dependencies, fakes } = createDependencies({
            resolveResult: Result.ok([makeResolvedPackage({ bundleDependencies: [{ name: 'dep' }] })])
        });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(validatedConfig, baseOptions, fakes.resolveAndLinkAll);

        assert.deepStrictEqual(expectErr(result), { type: 'bundle-dependencies-unsupported', packageName: 'pkg-a' });
    });

    test('materializes a transitive bundle dependency closure as node_modules/<dep>/ extras when vendoring is enabled', async function () {
        const versionedTarget = makeBareVersionedBundle('pkg-a');
        const versionedShared: FakeVersionedBundle = {
            ...makeBareVersionedBundle('shared'),
            manifestFile: {
                content: JSON.stringify({ name: 'shared', version: '0.0.0' }),
                isExecutable: false,
                filePath: 'package.json'
            },
            contents: [
                { fileDescription: { targetFilePath: 'index.js', content: 'export const x = 1;', isExecutable: false } }
            ]
        };
        const versionedTooling: FakeVersionedBundle = {
            ...makeBareVersionedBundle('tooling'),
            manifestFile: {
                content: JSON.stringify({ name: 'tooling', version: '0.0.0' }),
                isExecutable: false,
                filePath: 'package.json'
            },
            contents: [
                { fileDescription: { targetFilePath: 'lib.js', content: 'export const y = 2;', isExecutable: false } }
            ]
        };
        const lookup = new Map<string, FakeVersionedBundle>([
            ['pkg-a', versionedTarget],
            ['shared', versionedShared],
            ['tooling', versionedTooling]
        ]);
        const addVersion = fake((options: { bundle: { name: string } }) => {
            return lookup.get(options.bundle.name) ?? versionedTarget;
        });
        const packEmitterPack = fake.resolves(undefined);
        const target = makeResolvedPackage({ bundleDependencyNames: ['shared'] });
        const shared = makeResolvedPackage({ name: 'shared', bundleDependencyNames: ['tooling'] });
        const tooling = makeResolvedPackage({ name: 'tooling' });
        const resolveAndLinkAll = fake.resolves(Result.ok([target, shared, tooling]));
        const runPack = createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack));

        const extraFiles = await runVendorAndExpectExtraFiles(runPack, resolveAndLinkAll, packEmitterPack);
        const sortedPaths = extraFiles
            .map((entry) => {
                return entry.filePath;
            })
            .toSorted((a, b) => {
                return a.localeCompare(b);
            });
        assert.deepStrictEqual(sortedPaths, [
            'node_modules/shared/index.js',
            'node_modules/shared/package.json',
            'node_modules/tooling/lib.js',
            'node_modules/tooling/package.json'
        ]);
    });

    test('deduplicates bundle dependencies that are reachable through multiple paths in the closure', async function () {
        const versionedBundle = makeBareVersionedBundle('pkg-a');
        const versionedShared = makeBareVersionedBundle('shared');
        const versionedLeftAndRight: FakeVersionedBundle = {
            ...versionedShared,
            contents: [{ fileDescription: { targetFilePath: 'index.js', content: 'export {};', isExecutable: false } }]
        };
        const lookup = new Map<string, FakeVersionedBundle>([
            ['pkg-a', versionedBundle],
            ['left', { ...versionedLeftAndRight, name: 'left' }],
            ['right', { ...versionedLeftAndRight, name: 'right' }],
            ['shared', versionedShared]
        ]);
        const addVersion = fake((options: { bundle: { name: string } }) => {
            return lookup.get(options.bundle.name) ?? versionedBundle;
        });
        const packEmitterPack = fake.resolves(undefined);
        const target = makeResolvedPackage({ bundleDependencyNames: ['left', 'right'] });
        const left = makeResolvedPackage({ name: 'left', bundleDependencyNames: ['shared'] });
        const right = makeResolvedPackage({ name: 'right', bundleDependencyNames: ['shared'] });
        const shared = makeResolvedPackage({ name: 'shared' });
        const resolveAndLinkAll = fake.resolves(Result.ok([target, left, right, shared]));
        const runPack = createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack));

        await runPack(validatedConfig, { ...baseOptions, vendorDependencies: true }, resolveAndLinkAll);

        const emitOptions = packEmitterPack.firstCall.args[0] as {
            readonly extraFiles: readonly { readonly filePath: string }[];
        };
        const sharedEntries = emitOptions.extraFiles.filter((entry) => {
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
        const target = makeResolvedPackage({ bundleDependencyNames: ['missing'] });
        const resolveAndLinkAll = fake.resolves(Result.ok([target]));
        const runPack = createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack));

        const extraFiles = await runVendorAndExpectExtraFiles(runPack, resolveAndLinkAll, packEmitterPack);
        assert.deepStrictEqual(extraFiles, []);
    });

    test('returns a peer-dependencies-unsatisfied failure listing only the peers that are missing from the closure', async function () {
        // 'react' is in the closure (satisfied), 'react-router' is not (unsatisfied).
        const materializerSpy = fake.resolves(
            Result.ok({
                entries: [],
                packageNames: ['react-dom', 'react'],
                peerRequirements: new Map<string, readonly string[]>([['react-dom', ['react', 'react-router']]])
            })
        );
        const { dependencies, fakes } = createDependencies({
            materializerSpy,
            resolveResult: Result.ok([
                makeResolvedPackage({ externalDependencyNames: ['react-dom'], sourcesFolder: '/repo/source' })
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
            items: [{ packageName: 'react-dom', peer: 'react-router' }]
        });
        assert.strictEqual(fakes.packEmitterPack.callCount, 0);
    });

    test('maps a vendor symlink-target-outside-package failure to the corresponding pack failure and never emits an artifact', async function () {
        const materializerSpy = fake.resolves(
            Result.err({
                type: 'symlink-target-outside-package',
                packageName: 'evil',
                entryRelativePath: 'leak.json',
                resolvedTargetPath: '/Users/victim/.npmrc'
            })
        );
        const { dependencies, fakes } = createDependencies({
            materializerSpy,
            resolveResult: Result.ok([
                makeResolvedPackage({ externalDependencyNames: ['evil'], sourcesFolder: '/repo/source' })
            ])
        });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(
            validatedConfig,
            { ...baseOptions, vendorDependencies: true },
            fakes.resolveAndLinkAll
        );

        assert.deepStrictEqual(expectErr(result), {
            type: 'vendor-symlink-target-outside-package',
            packageName: 'pkg-a',
            vendoredPackageName: 'evil',
            entryRelativePath: 'leak.json',
            resolvedTargetPath: '/Users/victim/.npmrc'
        });
        assert.strictEqual(fakes.packEmitterPack.callCount, 0);
    });

    test('aggregates peer requirements from both the bundle-dep closure and the external vendor closure', async function () {
        const versionedTarget = makeBareVersionedBundle('pkg-a');
        const versionedShared: FakeVersionedBundle = {
            ...makeBareVersionedBundle('shared'),
            peerDependencies: { 'styled-components': '^6.0.0' }
        };
        const lookup = new Map<string, FakeVersionedBundle>([
            ['pkg-a', versionedTarget],
            ['shared', versionedShared]
        ]);
        const addVersion = fake((options: { bundle: { name: string } }) => {
            return lookup.get(options.bundle.name) ?? versionedTarget;
        });
        const packEmitterPack = fake.resolves(undefined);
        const target = makeResolvedPackage({ bundleDependencyNames: ['shared'] });
        const shared = makeResolvedPackage({ name: 'shared' });
        const resolveAndLinkAll = fake.resolves(Result.ok([target, shared]));
        const runPack = createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack));

        const result = await runPack(validatedConfig, { ...baseOptions, vendorDependencies: true }, resolveAndLinkAll);

        // 'styled-components' from the bundle-dep ('shared') is not in any closure, so it surfaces.
        assert.deepStrictEqual(expectErr(result), {
            type: 'peer-dependencies-unsatisfied',
            packageName: 'pkg-a',
            items: [{ packageName: 'shared', peer: 'styled-components' }]
        });
    });

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
    });

    test('falls back to the original manifest unchanged when vendoring is on but the manifest content is not a JSON object', async function () {
        const malformedContent = JSON.stringify(['unexpected', 'array']);
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
            readonly bundle: { readonly manifestFile: { readonly content: string } };
        };
        assert.strictEqual(emitted.bundle.manifestFile.content, malformedContent);
    });

    test('materializes externals and strips dependencies + peerDependencies from the manifest when vendorDependencies is enabled', async function () {
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
        const vendorEntries = [
            {
                sourceAbsolutePath: '/repo/node_modules/left-pad/index.js',
                targetRelativePath: 'node_modules/left-pad/index.js',
                isExecutable: false
            }
        ];
        const materializerSpy = fake.resolves(
            Result.ok({
                entries: vendorEntries,
                packageNames: ['left-pad'],
                peerRequirements: new Map<string, readonly string[]>()
            })
        );
        const { dependencies, fakes } = createDependencies({
            versionedBundle,
            materializerSpy,
            resolveResult: Result.ok([
                makeResolvedPackage({
                    externalDependencyNames: ['left-pad'],
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

        assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
        assert.strictEqual(materializerSpy.callCount, 1);
        assert.deepStrictEqual(materializerSpy.firstCall.args, [
            { initialDependencyNames: ['left-pad'], projectFolder: '/repo/source' }
        ]);
        const emitArgs = fakes.packEmitterPack.firstCall.args as readonly unknown[];
        const emitOptions = emitArgs[0] as {
            readonly bundle: { readonly manifestFile: { readonly content: string } };
            readonly vendorEntries: readonly unknown[];
        };
        const slimManifest = JSON.parse(emitOptions.bundle.manifestFile.content) as Record<string, unknown>;
        assert.strictEqual('dependencies' in slimManifest, false);
        assert.strictEqual('peerDependencies' in slimManifest, false);
        assert.strictEqual(slimManifest.name, 'pkg-a');
        assert.deepStrictEqual(emitOptions.vendorEntries, vendorEntries);
    });
});

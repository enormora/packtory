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
    readonly manifestFile: { readonly content: string; readonly isExecutable: boolean; readonly filePath: string; };
    readonly contents: readonly {
        readonly fileDescription: {
            readonly targetFilePath: string;
            readonly content: string;
            readonly isExecutable: boolean;
        };
    }[];
    readonly peerDependencies: Readonly<Record<string, string>>;
};

type ResolvedPackageOverrides = {
    readonly name?: string;
    readonly bundleDependencies?: readonly unknown[];
    readonly externalDependencyNames?: readonly string[];
    readonly bundleDependencyNames?: readonly string[];
    readonly sourcesFolder?: string;
    readonly contents?: readonly unknown[];
};

type VendorEntryFixture = {
    readonly sourceAbsolutePath: string;
    readonly sourcePackageRootPath: string;
    readonly targetRelativePath: string;
    readonly isExecutable: boolean;
};

type DependencyOverrides = {
    readonly versionedBundle?: unknown;
    readonly resolveResult?: Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>;
    readonly materializerSpy?: SinonSpy;
    readonly vendorEntries?: readonly VendorEntryFixture[];
};

type CreatedDependencies = {
    readonly dependencies: PackRunDependencies;
    readonly fakes: RunPackDependenciesFakes;
};

type AddVersionInput = {
    readonly bundle: { readonly name: string; };
};

const baseOptions: PackOptions = {
    packageName: 'pkg-a',
    format: 'zip',
    outputPath: '/out/pkg-a.zip',
    version: '0.0.0',
    vendorDependencies: false
};

function valueOrFallback<TValue>(value: TValue | undefined, fallback: TValue): TValue {
    return value ?? fallback;
}

function makeResolvedPackage(overrides: ResolvedPackageOverrides = {}): ResolvedPackage {
    const externalDependencies = new Map(
        valueOrFallback(overrides.externalDependencyNames, []).map(function (name) {
            return [ name, { name, referencedFrom: [ '/x' ] as const } ];
        })
    );
    const linkedBundleDependencies = new Map(
        valueOrFallback(overrides.bundleDependencyNames, []).map(function (name) {
            return [ name, { name, referencedFrom: [ '/x' ] as const } ];
        })
    );
    const packageName = valueOrFallback(overrides.name, 'pkg-a');
    return {
        name: packageName,
        analyzedBundle: {
            name: packageName,
            contents: valueOrFallback(overrides.contents, []),
            externalDependencies,
            linkedBundleDependencies
        } as unknown as ResolvedPackage['analyzedBundle'],
        resolveOptions: {
            mainPackageJson: { type: 'module' },
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            bundleDependencies: valueOrFallback(overrides.bundleDependencies, []),
            bundlePeerDependencies: [],
            roots: { main: { js: 'index.js' } },
            surface: { kind: 'implicit' },
            sourcesFolder: valueOrFallback(overrides.sourcesFolder, '/repo')
        } as unknown as ResolvedPackage['resolveOptions']
    };
}

type RunPackDependenciesFakes = {
    readonly versionManagerAddVersion: SinonSpy;
    readonly packEmitterPack: SinonSpy;
    readonly resolveAndLinkAll: SinonSpy;
};

function createDependencies(overrides: DependencyOverrides): CreatedDependencies {
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
        pack: packEmitterPack
    };
    const resolveAndLinkAll = fake.resolves(overrides.resolveResult ?? Result.ok([ makeResolvedPackage() ]));
    const materializeExternals = overrides.materializerSpy ??
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
): Promise<readonly { readonly filePath: string; readonly content: string; }[]> {
    const result = await runPack(validatedConfig, { ...baseOptions, vendorDependencies: true }, resolveAndLinkAll);
    assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
    const emitOptions = packEmitterPack.firstCall.args[0] as {
        readonly extraFiles: readonly { readonly filePath: string; readonly content: string; }[];
    };
    return emitOptions.extraFiles;
}

type PackClosureScenario = {
    readonly runPack: ReturnType<typeof createRunPackValidated>;
    readonly resolveAndLinkAll: SinonSpy;
    readonly packEmitterPack: SinonSpy;
};

function createTransitiveBundleClosureScenario(): PackClosureScenario {
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
        contents: [ {
            fileDescription: { targetFilePath: 'lib.js', content: 'export const y = 2;', isExecutable: false }
        } ]
    };
    const lookup = new Map<string, FakeVersionedBundle>([
        [ 'pkg-a', versionedTarget ],
        [ 'shared', versionedShared ],
        [ 'tooling', versionedTooling ]
    ]);
    const addVersion = fake(function (options: AddVersionInput) {
        return lookup.get(options.bundle.name) ?? versionedTarget;
    });
    const packEmitterPack = fake.resolves(undefined);
    const resolveAndLinkAll = fake.resolves(Result.ok([
        makeResolvedPackage({ bundleDependencyNames: [ 'shared' ] }),
        makeResolvedPackage({ name: 'shared', bundleDependencyNames: [ 'tooling' ] }),
        makeResolvedPackage({ name: 'tooling' })
    ]));
    return {
        runPack: createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack)),
        resolveAndLinkAll,
        packEmitterPack
    };
}

function createDeduplicatedBundleClosureScenario(): PackClosureScenario {
    const versionedBundle = makeBareVersionedBundle('pkg-a');
    const versionedShared = makeBareVersionedBundle('shared');
    const versionedLeftAndRight: FakeVersionedBundle = {
        ...versionedShared,
        contents: [ {
            fileDescription: { targetFilePath: 'index.js', content: 'export {};', isExecutable: false }
        } ]
    };
    const lookup = new Map<string, FakeVersionedBundle>([
        [ 'pkg-a', versionedBundle ],
        [ 'left', { ...versionedLeftAndRight, name: 'left' } ],
        [ 'right', { ...versionedLeftAndRight, name: 'right' } ],
        [ 'shared', versionedShared ]
    ]);
    const addVersion = fake(function (options: AddVersionInput) {
        return lookup.get(options.bundle.name) ?? versionedBundle;
    });
    const packEmitterPack = fake.resolves(undefined);
    const resolveAndLinkAll = fake.resolves(Result.ok([
        makeResolvedPackage({ bundleDependencyNames: [ 'left', 'right' ] }),
        makeResolvedPackage({ name: 'left', bundleDependencyNames: [ 'shared' ] }),
        makeResolvedPackage({ name: 'right', bundleDependencyNames: [ 'shared' ] }),
        makeResolvedPackage({ name: 'shared' })
    ]));
    return {
        runPack: createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack)),
        resolveAndLinkAll,
        packEmitterPack
    };
}

function sortedFilePaths(extraFiles: readonly { readonly filePath: string; }[]): readonly string[] {
    return extraFiles
        .map(function (entry) {
            return entry.filePath;
        })
        .toSorted(function (leftPath, rightPath) {
            return leftPath.localeCompare(rightPath);
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
});

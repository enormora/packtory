import assert from 'node:assert';
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
} from '../packtory/packtory-pack.ts';
import type { InternalResolveAndLinkFailure } from '../packtory/packtory-resolve.ts';
import type { ResolvedPackage } from '../packtory/resolved-package.ts';

export const validatedConfig = {} as unknown as ValidConfigWithoutRegistryResult;

export type FakeVersionedBundle = {
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

export type VendorEntryFixture = {
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

export type AddVersionInput = {
    readonly bundle: { readonly name: string; };
};

export const baseOptions: PackOptions = {
    packageName: 'pkg-a',
    format: 'zip',
    outputPath: '/out/pkg-a.zip',
    version: '0.0.0',
    vendorDependencies: false
};

function valueOrFallback<TValue>(value: TValue | undefined, fallback: TValue): TValue {
    return value ?? fallback;
}

export function makeResolvedPackage(overrides: ResolvedPackageOverrides = {}): ResolvedPackage {
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

export type RunPackDependenciesFakes = {
    readonly versionManagerAddVersion: SinonSpy;
    readonly packEmitterPack: SinonSpy;
    readonly resolveAndLinkAll: SinonSpy;
};

export function createDependencies(overrides: DependencyOverrides): CreatedDependencies {
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

export function expectErr(result: Result<undefined, InternalPackFailure>): InternalPackFailure {
    if (result.isOk) {
        assert.fail('expected Err result');
    }
    return result.error;
}

export function buildDependenciesWith(
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

export function makeBareVersionedBundle(name: string): FakeVersionedBundle {
    return {
        name,
        version: '0.0.0',
        manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' },
        contents: [],
        peerDependencies: {}
    };
}

export async function runVendorAndExpectExtraFiles(
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

export function createTransitiveBundleClosureScenario(): PackClosureScenario {
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

export function createDeduplicatedBundleClosureScenario(): PackClosureScenario {
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

export function sortedFilePaths(extraFiles: readonly { readonly filePath: string; }[]): readonly string[] {
    return extraFiles
        .map(function (entry) {
            return entry.filePath;
        })
        .toSorted(function (leftPath, rightPath) {
            return leftPath.localeCompare(rightPath);
        });
}

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
        readonly sourcesFolder?: string;
    } = {}
): ResolvedPackage {
    const externalDependencies = new Map(
        (overrides.externalDependencyNames ?? []).map((name) => {
            return [name, { name, referencedFrom: ['/x'] as const }];
        })
    );
    return {
        name: overrides.name ?? 'pkg-a',
        analyzedBundle: {
            contents: [],
            externalDependencies
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
        overrides.materializerSpy ?? fake.resolves({ entries: overrides.vendorEntries ?? [], packageNames: [] });
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

    test('returns a bundle-dependencies-unsupported failure when the target package declares bundle dependencies', async function () {
        const { dependencies, fakes } = createDependencies({
            resolveResult: Result.ok([makeResolvedPackage({ bundleDependencies: [{ name: 'dep' }] })])
        });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(validatedConfig, baseOptions, fakes.resolveAndLinkAll);

        assert.deepStrictEqual(expectErr(result), { type: 'bundle-dependencies-unsupported', packageName: 'pkg-a' });
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
            { bundle: versionedBundle, format: 'tar', outputPath: '/out/pkg-a.tgz', vendorEntries: [] }
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
        const materializerSpy = fake.resolves({ entries: vendorEntries, packageNames: ['left-pad'] });
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

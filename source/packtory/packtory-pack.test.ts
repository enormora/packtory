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
    version: '0.0.0'
};

function makeResolvedPackage(
    overrides: { readonly name?: string; readonly bundleDependencies?: readonly unknown[] } = {}
): ResolvedPackage {
    return {
        name: overrides.name ?? 'pkg-a',
        analyzedBundle: { contents: [] } as unknown as ResolvedPackage['analyzedBundle'],
        resolveOptions: {
            mainPackageJson: { type: 'module' },
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            bundleDependencies: overrides.bundleDependencies ?? [],
            bundlePeerDependencies: [],
            roots: { main: { js: 'index.js' } },
            surface: { kind: 'implicit' }
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
}): { readonly dependencies: PackRunDependencies; readonly fakes: RunPackDependenciesFakes } {
    const versionedBundle = overrides.versionedBundle ?? { name: 'pkg-a', version: '0.0.0' };
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
    return {
        dependencies: { versionManager, packEmitter },
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
            { bundle: versionedBundle, format: 'tar', outputPath: '/out/pkg-a.tgz' }
        ]);
    });
});

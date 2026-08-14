import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import {
    makeResolvedPackage,
    validatedConfig
} from '../test-libraries/packtory-pack-test-support.ts';
import { createInspectPackageTreeValidated } from './packtory-package-tree.ts';
import type { PackageTreeFailure, PackageTreeResult, ResolveAndLinkFailure } from './packtory-results.ts';

type TreeFixture = {
    readonly addVersion: SinonSpy;
    readonly collectContents: SinonSpy;
    readonly runTree: ReturnType<typeof createInspectPackageTreeValidated>;
};

function expectErr(result: PackageTreeResult): PackageTreeFailure {
    if (result.isOk) {
        assert.fail('expected Err result');
    }
    return result.error;
}

function createTreeFixture(versionedBundle: unknown): TreeFixture {
    const addVersion = fake.returns(versionedBundle);
    const collectContents = fake.returns([]);
    return {
        addVersion,
        collectContents,
        runTree: createInspectPackageTreeValidated({
            artifactsBuilder: { collectContents },
            versionManager: { addVersion: addVersion as never }
        })
    };
}

async function inspectWith(
    fixture: TreeFixture,
    resolveAndLinkAll: SinonSpy,
    selectEntries: SinonSpy
): Promise<PackageTreeResult> {
    return fixture.runTree(validatedConfig, 'pkg-a', resolveAndLinkAll, selectEntries);
}

function selectEmptyTree(): SinonSpy {
    return fake.returns(Result.ok({ packageName: 'pkg-a', entries: [] }));
}

suite('packtory-package-tree', function () {
    test('passes resolve-and-link failures through unchanged', async function () {
        const resolveFailure: ResolveAndLinkFailure = { type: 'checks', issues: [ 'boom' ] };
        const resolveAndLinkAll = fake.resolves(Result.err(resolveFailure));
        const fixture = createTreeFixture({});

        const result = await inspectWith(fixture, resolveAndLinkAll, selectEmptyTree());

        assert.deepStrictEqual(expectErr(result), resolveFailure);
    });

    test('returns package-not-found when no resolved package matches the requested name', async function () {
        const resolveAndLinkAll = fake.resolves(Result.ok([ makeResolvedPackage({ name: 'other' }) ]));
        const fixture = createTreeFixture({});

        const result = await inspectWith(fixture, resolveAndLinkAll, selectEmptyTree());

        assert.deepStrictEqual(expectErr(result), { type: 'package-not-found', packageName: 'pkg-a' });
    });

    test('stamps and collects the selected package without vendoring bundle dependencies', async function () {
        const versionedBundle = {
            name: 'pkg-a',
            version: '0.0.0',
            manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false },
            contents: []
        };
        const bundleDependency = { name: 'dep' };
        const resolveAndLinkAll = fake.resolves(Result.ok([
            makeResolvedPackage({ bundleDependencies: [ bundleDependency ] })
        ]));
        const fixture = createTreeFixture(versionedBundle);

        const result = await inspectWith(fixture, resolveAndLinkAll, selectEmptyTree());

        assert.strictEqual(result.isOk, true);
        assert.deepStrictEqual(fixture.addVersion.firstCall.args[0], {
            bundle: makeResolvedPackage().analyzedBundle,
            version: '0.0.0',
            mainPackageJson: { type: 'module' },
            bundleDependencies: [ { name: 'dep', version: '0.0.0' } ],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            substitutionPublicModuleSourcePaths: undefined
        });
        assert.deepStrictEqual(fixture.collectContents.firstCall.args, [ versionedBundle ]);
    });

    test('returns the selected tree entries after artifact collection', async function () {
        const entries = [
            { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] }
        ] as const;
        const resolveAndLinkAll = fake.resolves(Result.ok([ makeResolvedPackage() ]));
        const selectEntries = fake.returns(Result.ok({ packageName: 'pkg-a', entries }));
        const fixture = createTreeFixture({});

        const result = await inspectWith(fixture, resolveAndLinkAll, selectEntries);

        assert.deepStrictEqual(result.isOk ? result.value : undefined, { packageName: 'pkg-a', entries });
        assert.strictEqual(selectEntries.callCount, 1);
    });
});

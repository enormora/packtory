import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    assertRejectsWithMessages,
    bundle,
    createContext,
    matchingAnalyzedBundle,
    resource,
    sourceResource,
    type SmokeGateContext,
    temporaryFolderPath,
    verify,
    withPackageJson
} from '../test-libraries/published-artifact-smoke-gate-fixtures.ts';

type PackageSourceDependencyContext = {
    readonly checkReadability: SinonSpy;
    readonly context: SmokeGateContext;
    readonly targetBundle: VersionedBundleWithManifest;
};

function assertReadabilityPaths(checkReadability: SinonSpy, paths: readonly string[]): void {
    assert.deepStrictEqual(
        checkReadability.getCalls().map(function (call) {
            return call.args[0] as string;
        }),
        paths
    );
}

function createPackageSourceDependencyContext(
    inputFilePath: string,
    dependencyPath: string
): PackageSourceDependencyContext {
    const checkReadability = fake(async function (sourcePath: string) {
        return { isReadable: sourcePath === dependencyPath };
    });
    const targetBundle = withPackageJson(
        bundle({
            contents: [ sourceResource(inputFilePath, 'index.js') ]
        }),
        {
            dependencies: { external: '^2.0.0' }
        }
    );
    const context = createContext({
        fileManager: {
            checkReadability,
            setExecutable: fake.resolves(undefined),
            writeFile: fake.resolves(undefined)
        }
    });

    return { checkReadability, context, targetBundle };
}

suite('published artifact smoke gate dependency staging', function () {
    test('stages bundle dependencies and symlinks generated external dependencies', async function () {
        const targetBundle = withPackageJson(bundle(), {
            dependencies: {
                'package-b': '1.0.0',
                external: '^2.0.0'
            }
        });
        const dependencyBundle = bundle({
            name: 'package-b',
            contents: [ resource('dependency.js') ],
            exportsField: { '.': { import: './dependency.js' } }
        });
        const context = createContext();

        await context.gate.verify({
            analyzedBundle: matchingAnalyzedBundle(targetBundle),
            bundle: targetBundle,
            extraFiles: [],
            dependencyBundles: [ dependencyBundle ]
        });

        assert.deepStrictEqual(context.linkDirectory.firstCall.args, [
            path.join('/repo', 'node_modules', 'external'),
            path.join(temporaryFolderPath, 'node_modules', 'external'),
            'dir'
        ]);
        assert.deepStrictEqual([ context.linkDirectory.callCount ], [ 1 ]);
        assert.ok(
            context.writeFile.getCalls().some(function (call) {
                return call.args[0] === path.join(temporaryFolderPath, 'node_modules', 'package-b', 'dependency.js');
            })
        );
    });

    test('links shared external dependencies once across staged packages', async function () {
        const targetBundle = withPackageJson(bundle(), {
            dependencies: { external: '^2.0.0' }
        });
        const dependencyBundle = withPackageJson(
            bundle({
                name: 'package-b',
                contents: [ resource('dependency.js') ],
                exportsField: { '.': { import: './dependency.js' } }
            }),
            {
                dependencies: { external: '^2.0.0' }
            }
        );
        const context = createContext();

        await context.gate.verify({
            analyzedBundle: matchingAnalyzedBundle(targetBundle),
            bundle: targetBundle,
            extraFiles: [],
            dependencyBundles: [ dependencyBundle ]
        });

        assert.deepStrictEqual([
            context.linkDirectory.callCount,
            context.linkDirectory.firstCall.args
        ], [
            1,
            [
                path.join('/repo', 'node_modules', 'external'),
                path.join(temporaryFolderPath, 'node_modules', 'external'),
                'dir'
            ]
        ]);
    });

    test('links external dependencies from the package source tree', async function () {
        const dependencyPath = path.join('/fixture', 'node_modules', 'external');
        const { checkReadability, context, targetBundle } = createPackageSourceDependencyContext(
            '/fixture/src/index.js',
            dependencyPath
        );

        await verify(context.gate, targetBundle);

        assertReadabilityPaths(checkReadability, [
            path.join('/repo', 'node_modules', 'external'),
            path.join('/fixture', 'src', 'node_modules', 'external'),
            dependencyPath,
            path.join('/repo', 'node_modules', 'external'),
            path.join('/fixture', 'src', 'node_modules', 'external'),
            dependencyPath
        ]);
        assert.deepStrictEqual(context.linkDirectory.firstCall.args, [
            dependencyPath,
            path.join(temporaryFolderPath, 'node_modules', 'external'),
            'dir'
        ]);
    });

    test('stops package source dependency lookup at the repository root', async function () {
        const dependencyPath = path.join('/repo', 'fixture', 'node_modules', 'external');
        const { checkReadability, context, targetBundle } = createPackageSourceDependencyContext(
            '/repo/fixture/src/index.js',
            dependencyPath
        );

        await verify(context.gate, targetBundle);

        assertReadabilityPaths(checkReadability, [
            path.join('/repo', 'node_modules', 'external'),
            path.join('/repo', 'fixture', 'src', 'node_modules', 'external'),
            dependencyPath,
            path.join('/repo', 'node_modules', 'external'),
            path.join('/repo', 'fixture', 'src', 'node_modules', 'external'),
            path.join('/repo', 'fixture', 'node_modules', 'external')
        ]);
        assert.deepStrictEqual(context.linkDirectory.firstCall.args, [
            dependencyPath,
            path.join(temporaryFolderPath, 'node_modules', 'external'),
            'dir'
        ]);
    });

    test('reports missing generated dependencies before staging', async function () {
        const targetBundle = withPackageJson(bundle(), {
            dependencies: { missing: '^1.0.0' },
            peerDependencies: { 'missing-peer': '^2.0.0' }
        });
        const context = createContext({
            fileManager: {
                checkReadability: fake.resolves({ isReadable: false }),
                setExecutable: fake.resolves(undefined),
                writeFile: fake.resolves(undefined)
            }
        });

        await assertRejectsWithMessages(async function () {
            await verify(context.gate, targetBundle);
        }, [
            'dependency "missing" is not installed at "node_modules/missing"',
            'dependency "missing-peer" is not installed at "node_modules/missing-peer"'
        ]);
        assert.strictEqual(context.createTemporaryFolder.callCount, 0);
    });

    test('reports dead-code-elimination invariant failures before staging', async function () {
        const targetBundle = bundle({
            contents: [ resource('index.js', "import './missing.js';\nexport const value = 1;") ]
        });
        const context = createContext();

        await assertRejectsWithMessages(async function () {
            await verify(context.gate, targetBundle);
        }, [
            'Dead code elimination output invariant failed:',
            'index.js imports ./missing.js in runtime mode'
        ]);
        assert.strictEqual(context.createTemporaryFolder.callCount, 0);
    });
});

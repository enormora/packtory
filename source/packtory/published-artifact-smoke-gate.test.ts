import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    assertRejectsWithMessages,
    bundle,
    createContext,
    probeInputAt,
    resource,
    temporaryFolderPath,
    type SmokeGateContext,
    verify
} from '../test-libraries/published-artifact-smoke-gate-fixtures.ts';

function assertNoSmokeProbe(context: SmokeGateContext): void {
    assert.deepStrictEqual([
        context.createTemporaryFolder.callCount,
        context.runImportProbe.callCount
    ], [ 0, 0 ]);
}

async function assertVerifyRejectsWithMessages(
    context: SmokeGateContext,
    targetBundle: VersionedBundleWithManifest,
    messages: readonly string[]
): Promise<void> {
    await assertRejectsWithMessages(async function () {
        await verify(context.gate, targetBundle);
    }, messages);
}

suite('published artifact smoke gate', function () {
    suite('target validation', function () {
        suite('exports', function () {
            test('imports public runtime exports and validates bins without executing them', async function () {
                const targetBundle = bundle({
                    contents: [
                        resource('index.js'),
                        resource('feature.js'),
                        resource('cli.js')
                    ],
                    exportsField: {
                        '.': { import: './index.js', types: './index.d.ts' },
                        './feature': { import: './feature.js' },
                        './package.json': './package.json'
                    },
                    binField: { 'package-a': './cli.js' }
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assert.deepStrictEqual(
                    [
                        probeInputAt(context.runImportProbe, 0).specifier,
                        probeInputAt(context.runImportProbe, 1).specifier
                    ],
                    [ 'package-a', 'package-a/feature' ]
                );
                assert.strictEqual(context.setExecutable.callCount, 1);
                assert.strictEqual(
                    context.setExecutable.firstCall.args[0],
                    path.join(temporaryFolderPath, 'node_modules', 'package-a', 'cli.js')
                );
            });

            test('imports root conditional exports and falls back to default runtime targets', async function () {
                const targetBundle = bundle({
                    contents: [ resource('index.mjs') ],
                    exportsField: {
                        types: './index.d.ts',
                        default: './index.mjs'
                    }
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assert.deepStrictEqual(probeInputAt(context.runImportProbe, 0), {
                    cwd: temporaryFolderPath,
                    packageName: 'package-a',
                    specifier: 'package-a',
                    targetFilePath: 'index.mjs',
                    timeoutMs: 3000
                });
            });

            test('imports string export fields and normalizes subpath exports', async function () {
                const targetBundle = bundle({
                    contents: [ resource('index.js'), resource('nested/feature.js'), resource('scoped/feature.js') ],
                    exportsField: {
                        '.': './index.js',
                        './nested/feature': './nested/feature.js',
                        './scoped/./feature': './scoped/feature.js'
                    }
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assert.deepStrictEqual([
                    probeInputAt(context.runImportProbe, 0).specifier,
                    probeInputAt(context.runImportProbe, 1).specifier,
                    probeInputAt(context.runImportProbe, 1).targetFilePath,
                    probeInputAt(context.runImportProbe, 2).specifier
                ], [
                    'package-a',
                    'package-a/nested/feature',
                    'nested/feature.js',
                    'package-a/scoped/./feature'
                ]);
            });

            test('imports whole string export fields', async function () {
                const targetBundle = bundle({
                    contents: [ resource('index.js') ],
                    exportsField: './index.js'
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assert.deepStrictEqual(probeInputAt(context.runImportProbe, 0), {
                    cwd: temporaryFolderPath,
                    packageName: 'package-a',
                    specifier: 'package-a',
                    targetFilePath: 'index.js',
                    timeoutMs: 3000
                });
            });

            test('imports bare string export targets', async function () {
                const targetBundle = bundle({
                    contents: [ resource('index.js') ],
                    exportsField: 'index.js'
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assert.strictEqual(probeInputAt(context.runImportProbe, 0).targetFilePath, 'index.js');
            });

            test('falls back from non-string conditional exports to default runtime targets', async function () {
                const targetBundle = bundle({
                    contents: [ resource('index.js') ],
                    exportsField: {
                        import: false,
                        default: './index.js'
                    } as unknown as VersionedBundleWithManifest['exportsField']
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assert.strictEqual(probeInputAt(context.runImportProbe, 0).targetFilePath, 'index.js');
            });

            test('treats mixed private and public export maps as export maps', async function () {
                const targetBundle = bundle({
                    contents: [ resource('feature.js'), resource('internal.js') ],
                    exportsField: {
                        '#internal': './internal.js',
                        './feature': './feature.js'
                    }
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assert.deepStrictEqual([
                    context.runImportProbe.callCount,
                    probeInputAt(context.runImportProbe, 0).specifier
                ], [
                    1,
                    'package-a/feature'
                ]);
            });

            test('skips root conditional exports without runtime targets', async function () {
                const targetBundle = bundle({
                    exportsField: {
                        types: './index.d.ts'
                    }
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assertNoSmokeProbe(context);
            });

            test('skips package manifest, private exports, and declaration-only exports', async function () {
                const targetBundle = bundle({
                    contents: [
                        resource('index.js'),
                        resource('index.d.ts', 'export type Api = string;'),
                        resource('internal.js')
                    ],
                    exportsField: {
                        '.': { import: './index.js', types: './index.d.ts' },
                        './package.json': './index.js',
                        './types': { types: './index.d.ts' },
                        '#internal': './internal.js'
                    }
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assert.deepStrictEqual([
                    context.runImportProbe.callCount,
                    probeInputAt(context.runImportProbe, 0).specifier
                ], [
                    1,
                    'package-a'
                ]);
            });
        });

        suite('skipped export shapes', function () {
            test('skips declaration string export fields', async function () {
                const targetBundle = bundle({
                    contents: [ resource('index.d.ts', 'export type Api = string;') ],
                    exportsField: './index.d.ts'
                });
                const context = createContext();

                await verify(context.gate, targetBundle);

                assertNoSmokeProbe(context);
            });

            test('skips invalid export fields', async function () {
                const invalidExportBundle = bundle({
                    exportsField: null as unknown as VersionedBundleWithManifest['exportsField']
                });
                const context = createContext();

                await verify(context.gate, invalidExportBundle);

                assert.deepStrictEqual([
                    context.createTemporaryFolder.callCount,
                    context.runImportProbe.callCount
                ], [ 0, 0 ]);
            });
        });

        suite('bins', function () {
            test('accepts string bin targets and ignores non-string bin map values', async function () {
                const stringBinBundle = bundle({
                    contents: [ resource('index.js'), resource('cli.js') ],
                    binField: './cli.js'
                });
                const objectBinBundle = bundle({
                    contents: [ resource('index.js'), resource('cli.js') ],
                    binField: {
                        'package-a': './cli.js',
                        ignored: false
                    } as unknown as VersionedBundleWithManifest['binField']
                });
                const context = createContext();

                await verify(context.gate, stringBinBundle);
                await verify(context.gate, objectBinBundle);

                assert.deepStrictEqual([
                    context.setExecutable.getCall(0).args[0],
                    context.setExecutable.getCall(0).args[1],
                    context.setExecutable.getCall(1).args[0],
                    context.setExecutable.getCall(1).args[1],
                    context.setExecutable.callCount
                ], [
                    path.join(temporaryFolderPath, 'node_modules', 'package-a', 'cli.js'),
                    true,
                    path.join(temporaryFolderPath, 'node_modules', 'package-a', 'cli.js'),
                    true,
                    2
                ]);
            });

            test('skips invalid bin fields', async function () {
                const invalidBinBundle = bundle({
                    exportsField: false as unknown as VersionedBundleWithManifest['exportsField'],
                    binField: false as unknown as VersionedBundleWithManifest['binField']
                });
                const invalidBinArrayBundle = bundle({
                    exportsField: false as unknown as VersionedBundleWithManifest['exportsField'],
                    binField: [ './cli.js' ] as unknown as VersionedBundleWithManifest['binField']
                });
                const context = createContext();

                await verify(context.gate, invalidBinBundle);
                await verify(context.gate, invalidBinArrayBundle);

                assert.deepStrictEqual([
                    context.createTemporaryFolder.callCount,
                    context.runImportProbe.callCount,
                    context.setExecutable.callCount
                ], [ 0, 0, 0 ]);
            });

            test('reports missing string bin targets', async function () {
                const targetBundle = bundle({
                    binField: './missing-cli.js'
                });
                const context = createContext();

                await assertVerifyRejectsWithMessages(context, targetBundle, [
                    'bin "package-a" points to missing artifact target "missing-cli.js"'
                ]);
            });
        });
    });

    suite('failure reporting', function () {
        test('reports missing export and bin targets together before runtime probing', async function () {
            const targetBundle = bundle({
                exportsField: {
                    '.': { import: './missing-export.js' }
                },
                binField: { 'package-a': './missing-bin.js' }
            });
            const context = createContext();

            await assertRejectsWithMessages(async function () {
                await verify(context.gate, targetBundle);
            }, [
                'export "package-a" points to missing artifact target "missing-export.js"',
                'bin "package-a" points to missing artifact target "missing-bin.js"'
            ]);
            await assert.rejects(async function () {
                await verify(context.gate, targetBundle);
            }, {
                message: 'Package "package-a" published artifact smoke check failed:\n' +
                    '- Package "package-a" export "package-a" points to missing artifact target "missing-export.js"\n' +
                    '- Package "package-a" bin "package-a" points to missing artifact target "missing-bin.js"'
            });
            assert.deepStrictEqual([
                context.createTemporaryFolder.callCount,
                context.runImportProbe.callCount
            ], [ 0, 0 ]);
        });

        test('reports all failed runtime export imports', async function () {
            const targetBundle = bundle({
                contents: [ resource('index.js'), resource('feature.js') ],
                exportsField: {
                    '.': { import: './index.js' },
                    './feature': { import: './feature.js' }
                }
            });
            const context = createContext({
                runImportProbe: fake.rejects(new Error('import exploded'))
            });

            await assertRejectsWithMessages(async function () {
                await verify(context.gate, targetBundle);
            }, [
                'export "package-a" target "index.js" failed import: import exploded',
                '- Package "package-a" export "package-a/feature" target "feature.js" failed import: import exploded'
            ]);
            assert.strictEqual(context.removeFolder.callCount, 1);
        });

        test('creates smoke folders with the expected prefix and removes them after string failures', async function () {
            const targetBundle = bundle();
            const context = createContext({
                runImportProbe: fake.rejects('plain failure')
            });

            await assertRejectsWithMessages(async function () {
                await verify(context.gate, targetBundle);
            }, [
                'failed import: plain failure'
            ]);

            assert.deepStrictEqual([
                context.createTemporaryFolder.firstCall.args,
                context.removeFolder.firstCall.args
            ], [
                [ 'packtory-smoke-' ],
                [ temporaryFolderPath ]
            ]);
        });
    });
});

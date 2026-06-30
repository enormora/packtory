import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createVendorMaterializer, type VendorMaterializerFailure } from './vendor-materializer.ts';
import {
    expectOk,
    runExpectingFailure,
    runWith,
    setupFileManager,
    targetRelativePaths,
    type FakeSetup,
    type StringResponse
} from './vendor-materializer-test-support.ts';

type SinglePackageSymlinkScenario = {
    readonly initialName: string;
    readonly packageRealPath: string;
    readonly listings: FakeSetup['listings'];
    readonly targetRealPath: StringResponse;
};

function registerMaterializationTests(): void {
    test('treats a package.json with malformed dependency maps as having no transitive dependencies and no peer requirements', async function () {
        const result = await runWith(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/broken' } ],
                listings: [ { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] } ],
                fileReads: [ { value: JSON.stringify({ dependencies: 'this should be an object' }) } ]
            },
            { initialDependencyNames: [ 'broken' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(result.packageNames, [ 'broken' ]);
        assert.deepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/repo/node_modules/broken/index.js',
                sourcePackageRootPath: '/repo/node_modules/broken',
                targetRelativePath: 'node_modules/broken/index.js',
                isExecutable: false
            }
        ]);
        assert.deepStrictEqual(Array.from(result.peerRequirements), [ [ 'broken', [] ] ]);
    });

    test('returns an empty result when no initial dependencies are requested', async function () {
        const fileManager = setupFileManager({ readabilities: [], realPaths: [], listings: [], fileReads: [] });
        const materializer = createVendorMaterializer({ fileManager });

        const result = expectOk(
            await materializer.materializeExternals({
                initialDependencyNames: [],
                projectFolder: '/repo'
            })
        );

        assert.deepStrictEqual(result.entries, []);
        assert.deepStrictEqual(result.packageNames, []);
    });

    test('collects files for a single dependency by probing the start folder first and reads its package.json by exact name', async function () {
        const fileManager = setupFileManager({
            readabilities: [ { value: { isReadable: true } } ],
            realPaths: [ { value: '/repo/node_modules/leaf' } ],
            listings: [
                {
                    value: [
                        { name: 'index.js', isDirectory: false, isSymbolicLink: false },
                        { name: 'package.json', isDirectory: false, isSymbolicLink: false }
                    ]
                }
            ],
            fileReads: [ { value: '{}' } ]
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = expectOk(
            await materializer.materializeExternals({
                initialDependencyNames: [ 'leaf' ],
                projectFolder: '/repo'
            })
        );

        assert.deepStrictEqual(result.packageNames, [ 'leaf' ]);
        assert.deepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/repo/node_modules/leaf/index.js',
                sourcePackageRootPath: '/repo/node_modules/leaf',
                targetRelativePath: 'node_modules/leaf/index.js',
                isExecutable: false
            },
            {
                sourceAbsolutePath: '/repo/node_modules/leaf/package.json',
                sourcePackageRootPath: '/repo/node_modules/leaf',
                targetRelativePath: 'node_modules/leaf/package.json',
                isExecutable: false
            }
        ]);
        assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), {
            fileOrFolderPath: '/repo/node_modules/leaf'
        });
        assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: '/repo/node_modules/leaf/package.json' });
    });

    test('walks transitively into both dependencies and peerDependencies declared by each visited package', async function () {
        const fileManager = setupFileManager({
            readabilities: [
                { value: { isReadable: true } },
                { value: { isReadable: true } },
                { value: { isReadable: true } }
            ],
            realPaths: [
                { value: '/repo/node_modules/root' },
                { value: '/repo/node_modules/dep' },
                { value: '/repo/node_modules/peer' }
            ],
            listings: [
                { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] },
                { value: [ { name: 'lib.js', isDirectory: false, isSymbolicLink: false } ] },
                { value: [ { name: 'peer.js', isDirectory: false, isSymbolicLink: false } ] }
            ],
            fileReads: [
                { value: JSON.stringify({ dependencies: { dep: '1.0.0' }, peerDependencies: { peer: '1.0.0' } }) },
                { value: '{}' },
                { value: '{}' }
            ]
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = expectOk(
            await materializer.materializeExternals({
                initialDependencyNames: [ 'root' ],
                projectFolder: '/repo'
            })
        );

        assert.deepStrictEqual(result.packageNames, [ 'root', 'dep', 'peer' ]);
        assert.deepStrictEqual(targetRelativePaths(result), [
            'node_modules/root/index.js',
            'node_modules/dep/lib.js',
            'node_modules/peer/peer.js'
        ]);
    });

    test('skips nested node_modules when walking files (nested packages are visited as separate closure entries instead)', async function () {
        // If the materializer mistakenly recurses into the nested node_modules, this second listing
        // would be consumed and "should-never-be-included.js" would appear in the result.
        const result = await runWith(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/pkg' } ],
                listings: [
                    {
                        value: [
                            { name: 'index.js', isDirectory: false, isSymbolicLink: false },
                            { name: 'node_modules', isDirectory: true, isSymbolicLink: false }
                        ]
                    },
                    {
                        value: [ { name: 'should-never-be-included.js', isDirectory: false, isSymbolicLink: false } ]
                    }
                ],
                fileReads: [ { value: '{}' } ]
            },
            { initialDependencyNames: [ 'pkg' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(targetRelativePaths(result), [ 'node_modules/pkg/index.js' ]);
    });

    test('recurses into non-node_modules subdirectories and preserves the relative path under the package root', async function () {
        const result = await runWith(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/pkg' } ],
                listings: [
                    { value: [ { name: 'src', isDirectory: true, isSymbolicLink: false } ] },
                    { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] }
                ],
                fileReads: [ { value: '{}' } ]
            },
            { initialDependencyNames: [ 'pkg' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/repo/node_modules/pkg/src/index.js',
                sourcePackageRootPath: '/repo/node_modules/pkg',
                targetRelativePath: 'node_modules/pkg/src/index.js',
                isExecutable: false
            }
        ]);
    });

    test('walks up parent folders to find a dependency when it is not under the starting folder', async function () {
        const fileManager = setupFileManager({
            readabilities: [
                { value: { isReadable: false } },
                { value: { isReadable: false } },
                { value: { isReadable: true } }
            ],
            realPaths: [ { value: '/workspace/node_modules/hoisted' } ],
            listings: [ { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] } ],
            fileReads: [ { value: '{}' } ]
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = expectOk(
            await materializer.materializeExternals({
                initialDependencyNames: [ 'hoisted' ],
                projectFolder: '/workspace/packages/inner'
            })
        );

        assert.deepStrictEqual(result.packageNames, [ 'hoisted' ]);
        assert.deepStrictEqual(fileManager.getAllCheckReadabilityCalls(), [
            { fileOrFolderPath: '/workspace/packages/inner/node_modules/hoisted' },
            { fileOrFolderPath: '/workspace/packages/node_modules/hoisted' },
            { fileOrFolderPath: '/workspace/node_modules/hoisted' }
        ]);
        assert.deepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/workspace/node_modules/hoisted/index.js',
                sourcePackageRootPath: '/workspace/node_modules/hoisted',
                targetRelativePath: 'node_modules/hoisted/index.js',
                isExecutable: false
            }
        ]);
    });

    test('skips dependencies that cannot be located in any reachable node_modules ancestor, probing every ancestor up to the filesystem root', async function () {
        const fileManager = setupFileManager({
            readabilities: Array.from({ length: 20 }, function () {
                return { value: { isReadable: false } };
            }),
            realPaths: [],
            listings: [],
            fileReads: []
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = expectOk(
            await materializer.materializeExternals({
                initialDependencyNames: [ 'missing' ],
                projectFolder: '/some/deep/folder'
            })
        );

        assert.deepStrictEqual(result.entries, []);
        assert.deepStrictEqual(result.packageNames, []);
        assert.deepStrictEqual(fileManager.getAllCheckReadabilityCalls(), [
            { fileOrFolderPath: '/some/deep/folder/node_modules/missing' },
            { fileOrFolderPath: '/some/deep/node_modules/missing' },
            { fileOrFolderPath: '/some/node_modules/missing' },
            { fileOrFolderPath: '/node_modules/missing' }
        ]);
    });

    test('deduplicates packages so the same name is materialized at most once even when referenced from multiple deps', async function () {
        const truthyReadability = { value: { isReadable: true } } as const;
        const result = await runWith(
            {
                readabilities: [ truthyReadability, truthyReadability, truthyReadability ],
                realPaths: [
                    { value: '/repo/node_modules/a' },
                    { value: '/repo/node_modules/b' },
                    { value: '/repo/node_modules/shared' }
                ],
                listings: [
                    { value: [ { name: 'a.js', isDirectory: false, isSymbolicLink: false } ] },
                    { value: [ { name: 'b.js', isDirectory: false, isSymbolicLink: false } ] },
                    { value: [ { name: 'shared.js', isDirectory: false, isSymbolicLink: false } ] }
                ],
                fileReads: [
                    { value: JSON.stringify({ dependencies: { shared: '1.0.0' } }) },
                    { value: JSON.stringify({ dependencies: { shared: '1.0.0' } }) },
                    { value: '{}' }
                ]
            },
            { initialDependencyNames: [ 'a', 'b' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(result.packageNames, [ 'a', 'b', 'shared' ]);
        const sharedCount = result
            .entries
            .filter(function (entry) {
                return entry.targetRelativePath.startsWith('node_modules/shared/');
            })
            .length;
        assert.strictEqual(sharedCount, 1);
    });
}

function registerSymlinkTests(): void {
    test('vendors a symlink whose resolved target stays inside the package directory', async function () {
        const result = await runWith(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/pkg' }, { value: '/repo/node_modules/pkg/dist/index.js' } ],
                listings: [
                    {
                        value: [
                            { name: 'dist', isDirectory: true, isSymbolicLink: false },
                            { name: 'bin.js', isDirectory: false, isSymbolicLink: true }
                        ]
                    },
                    {
                        value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ]
                    }
                ],
                fileReads: [ { value: '{}' } ]
            },
            { initialDependencyNames: [ 'pkg' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(targetRelativePaths(result), [
            'node_modules/pkg/dist/index.js',
            'node_modules/pkg/bin.js'
        ]);
    });

    test('vendors a symlink whose resolved target is the package directory itself', async function () {
        const result = await runWith(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/pkg' }, { value: '/repo/node_modules/pkg' } ],
                listings: [
                    {
                        value: [ { name: 'self-link', isDirectory: false, isSymbolicLink: true } ]
                    }
                ],
                fileReads: [ { value: '{}' } ]
            },
            { initialDependencyNames: [ 'pkg' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(targetRelativePaths(result), [ 'node_modules/pkg/self-link' ]);
    });

    test('rejects a symlink whose resolved target escapes the package directory', async function () {
        const failure = await runExpectingFailure(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/evil' }, { value: '/Users/victim/.npmrc' } ],
                listings: [
                    {
                        value: [ { name: 'leak.json', isDirectory: false, isSymbolicLink: true } ]
                    }
                ],
                fileReads: [ { value: '{}' } ]
            },
            { initialDependencyNames: [ 'evil' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(failure, {
            type: 'symlink-target-outside-package',
            packageName: 'evil',
            entryRelativePath: 'leak.json',
            resolvedTargetPath: '/Users/victim/.npmrc'
        });
    });

    async function runSinglePackageSymlinkScenario(
        scenario: SinglePackageSymlinkScenario
    ): Promise<VendorMaterializerFailure> {
        return await runExpectingFailure(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: scenario.packageRealPath }, scenario.targetRealPath ],
                listings: scenario.listings,
                fileReads: [ { value: '{}' } ]
            },
            { initialDependencyNames: [ scenario.initialName ], projectFolder: '/repo' }
        );
    }

    test('rejects a symlink whose resolved target is the immediate parent of the package directory', async function () {
        const failure = await runSinglePackageSymlinkScenario({
            initialName: 'pkg',
            packageRealPath: '/repo/node_modules/pkg',
            listings: [ { value: [ { name: 'parent-link', isDirectory: false, isSymbolicLink: true } ] } ],
            targetRealPath: { value: '/repo/node_modules' }
        });

        assert.deepStrictEqual(failure, {
            type: 'symlink-target-outside-package',
            packageName: 'pkg',
            entryRelativePath: 'parent-link',
            resolvedTargetPath: '/repo/node_modules'
        });
    });

    test('reports a nested symlink-entry path with forward slashes regardless of platform separators', async function () {
        const failure = await runSinglePackageSymlinkScenario({
            initialName: 'pkg',
            packageRealPath: '/repo/node_modules/pkg',
            listings: [
                { value: [ { name: 'config', isDirectory: true, isSymbolicLink: false } ] },
                { value: [ { name: 'secret-link', isDirectory: false, isSymbolicLink: true } ] }
            ],
            targetRealPath: { value: '/Users/victim/.ssh/id_rsa' }
        });

        assert.deepStrictEqual(failure, {
            type: 'symlink-target-outside-package',
            packageName: 'pkg',
            entryRelativePath: 'config/secret-link',
            resolvedTargetPath: '/Users/victim/.ssh/id_rsa'
        });
    });

    test('rejects a symlink whose target cannot be resolved (broken symlink) so packtory never blindly trusts it', async function () {
        const failure = await runSinglePackageSymlinkScenario({
            initialName: 'pkg',
            packageRealPath: '/repo/node_modules/pkg',
            listings: [ { value: [ { name: 'broken.json', isDirectory: false, isSymbolicLink: true } ] } ],
            targetRealPath: { error: new Error('ENOENT: no such file or directory') }
        });

        assert.deepStrictEqual(failure, {
            type: 'symlink-target-outside-package',
            packageName: 'pkg',
            entryRelativePath: 'broken.json',
            resolvedTargetPath: '/repo/node_modules/pkg/broken.json'
        });
    });
}

suite('vendor-materializer', function () {
    registerMaterializationTests();
    registerSymlinkTests();
});

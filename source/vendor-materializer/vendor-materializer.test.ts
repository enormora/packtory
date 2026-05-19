import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createVendorMaterializer } from './vendor-materializer.ts';

type ReadabilityResponse = { readonly value: { readonly isReadable: boolean } };
type StringResponse = { readonly value: string };
type DirectoryEntriesResponse = {
    readonly value: readonly {
        readonly name: string;
        readonly isDirectory: boolean;
        readonly isSymbolicLink: boolean;
    }[];
};

type FakeSetup = {
    readonly readabilities: readonly ReadabilityResponse[];
    readonly realPaths: readonly StringResponse[];
    readonly listings: readonly DirectoryEntriesResponse[];
    readonly fileReads: readonly StringResponse[];
};

function setupFileManager(setup: FakeSetup): ReturnType<typeof createFakeFileManager> {
    return createFakeFileManager({
        simulatedCheckReadabilityResponses: setup.readabilities,
        simulatedRealPathResponses: setup.realPaths,
        simulatedListDirectoryResponses: setup.listings,
        simulatedReadFileResponses: setup.fileReads
    });
}

async function runWith(
    setup: FakeSetup,
    request: { readonly initialDependencyNames: readonly string[]; readonly projectFolder: string }
): Promise<{
    readonly entries: readonly {
        readonly targetRelativePath: string;
        readonly sourceAbsolutePath: string;
        readonly isExecutable: boolean;
    }[];
    readonly packageNames: readonly string[];
    readonly peerRequirements: ReadonlyMap<string, readonly string[]>;
}> {
    const fileManager = setupFileManager(setup);
    const materializer = createVendorMaterializer({ fileManager });
    return await materializer.materializeExternals(request);
}

suite('vendor-materializer', function () {
    test('treats a package.json with malformed dependency maps as having no transitive dependencies and no peer requirements', async function () {
        const result = await runWith(
            {
                readabilities: [{ value: { isReadable: true } }],
                realPaths: [{ value: '/repo/node_modules/broken' }],
                listings: [{ value: [{ name: 'index.js', isDirectory: false, isSymbolicLink: false }] }],
                fileReads: [{ value: JSON.stringify({ dependencies: 'this should be an object' }) }]
            },
            { initialDependencyNames: ['broken'], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(result.packageNames, ['broken']);
        assert.deepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/repo/node_modules/broken/index.js',
                targetRelativePath: 'node_modules/broken/index.js',
                isExecutable: false
            }
        ]);
        assert.deepStrictEqual(Array.from(result.peerRequirements.entries()), [['broken', []]]);
    });

    test('returns an empty result when no initial dependencies are requested', async function () {
        const fileManager = setupFileManager({ readabilities: [], realPaths: [], listings: [], fileReads: [] });
        const materializer = createVendorMaterializer({ fileManager });

        const result = await materializer.materializeExternals({
            initialDependencyNames: [],
            projectFolder: '/repo'
        });

        assert.deepStrictEqual(result.entries, []);
        assert.deepStrictEqual(result.packageNames, []);
    });

    test('collects files for a single dependency by probing the start folder first and reads its package.json by exact name', async function () {
        const fileManager = setupFileManager({
            readabilities: [{ value: { isReadable: true } }],
            realPaths: [{ value: '/repo/node_modules/leaf' }],
            listings: [
                {
                    value: [
                        { name: 'index.js', isDirectory: false, isSymbolicLink: false },
                        { name: 'package.json', isDirectory: false, isSymbolicLink: false }
                    ]
                }
            ],
            fileReads: [{ value: '{}' }]
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = await materializer.materializeExternals({
            initialDependencyNames: ['leaf'],
            projectFolder: '/repo'
        });

        assert.deepStrictEqual(result.packageNames, ['leaf']);
        assert.deepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/repo/node_modules/leaf/index.js',
                targetRelativePath: 'node_modules/leaf/index.js',
                isExecutable: false
            },
            {
                sourceAbsolutePath: '/repo/node_modules/leaf/package.json',
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
                { value: [{ name: 'index.js', isDirectory: false, isSymbolicLink: false }] },
                { value: [{ name: 'lib.js', isDirectory: false, isSymbolicLink: false }] },
                { value: [{ name: 'peer.js', isDirectory: false, isSymbolicLink: false }] }
            ],
            fileReads: [
                { value: JSON.stringify({ dependencies: { dep: '1.0.0' }, peerDependencies: { peer: '1.0.0' } }) },
                { value: '{}' },
                { value: '{}' }
            ]
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = await materializer.materializeExternals({
            initialDependencyNames: ['root'],
            projectFolder: '/repo'
        });

        assert.deepStrictEqual(result.packageNames, ['root', 'dep', 'peer']);
        const targetPaths = result.entries.map((entry) => {
            return entry.targetRelativePath;
        });
        assert.deepStrictEqual(targetPaths, [
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
                readabilities: [{ value: { isReadable: true } }],
                realPaths: [{ value: '/repo/node_modules/pkg' }],
                listings: [
                    {
                        value: [
                            { name: 'index.js', isDirectory: false, isSymbolicLink: false },
                            { name: 'node_modules', isDirectory: true, isSymbolicLink: false }
                        ]
                    },
                    {
                        value: [{ name: 'should-never-be-included.js', isDirectory: false, isSymbolicLink: false }]
                    }
                ],
                fileReads: [{ value: '{}' }]
            },
            { initialDependencyNames: ['pkg'], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(
            result.entries.map((entry) => {
                return entry.targetRelativePath;
            }),
            ['node_modules/pkg/index.js']
        );
    });

    test('recurses into non-node_modules subdirectories and preserves the relative path under the package root', async function () {
        const result = await runWith(
            {
                readabilities: [{ value: { isReadable: true } }],
                realPaths: [{ value: '/repo/node_modules/pkg' }],
                listings: [
                    { value: [{ name: 'src', isDirectory: true, isSymbolicLink: false }] },
                    { value: [{ name: 'index.js', isDirectory: false, isSymbolicLink: false }] }
                ],
                fileReads: [{ value: '{}' }]
            },
            { initialDependencyNames: ['pkg'], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/repo/node_modules/pkg/src/index.js',
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
            realPaths: [{ value: '/workspace/node_modules/hoisted' }],
            listings: [{ value: [{ name: 'index.js', isDirectory: false, isSymbolicLink: false }] }],
            fileReads: [{ value: '{}' }]
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = await materializer.materializeExternals({
            initialDependencyNames: ['hoisted'],
            projectFolder: '/workspace/packages/inner'
        });

        assert.deepStrictEqual(result.packageNames, ['hoisted']);
        assert.deepStrictEqual(fileManager.getAllCheckReadabilityCalls(), [
            { fileOrFolderPath: '/workspace/packages/inner/node_modules/hoisted' },
            { fileOrFolderPath: '/workspace/packages/node_modules/hoisted' },
            { fileOrFolderPath: '/workspace/node_modules/hoisted' }
        ]);
        assert.deepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/workspace/node_modules/hoisted/index.js',
                targetRelativePath: 'node_modules/hoisted/index.js',
                isExecutable: false
            }
        ]);
    });

    test('skips dependencies that cannot be located in any reachable node_modules ancestor, probing every ancestor up to the filesystem root', async function () {
        const fileManager = setupFileManager({
            readabilities: Array.from({ length: 20 }, () => {
                return { value: { isReadable: false } };
            }),
            realPaths: [],
            listings: [],
            fileReads: []
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = await materializer.materializeExternals({
            initialDependencyNames: ['missing'],
            projectFolder: '/some/deep/folder'
        });

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
                readabilities: [truthyReadability, truthyReadability, truthyReadability],
                realPaths: [
                    { value: '/repo/node_modules/a' },
                    { value: '/repo/node_modules/b' },
                    { value: '/repo/node_modules/shared' }
                ],
                listings: [
                    { value: [{ name: 'a.js', isDirectory: false, isSymbolicLink: false }] },
                    { value: [{ name: 'b.js', isDirectory: false, isSymbolicLink: false }] },
                    { value: [{ name: 'shared.js', isDirectory: false, isSymbolicLink: false }] }
                ],
                fileReads: [
                    { value: JSON.stringify({ dependencies: { shared: '1.0.0' } }) },
                    { value: JSON.stringify({ dependencies: { shared: '1.0.0' } }) },
                    { value: '{}' }
                ]
            },
            { initialDependencyNames: ['a', 'b'], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(result.packageNames, ['a', 'b', 'shared']);
        const sharedCount = result.entries.filter((entry) => {
            return entry.targetRelativePath.startsWith('node_modules/shared/');
        }).length;
        assert.strictEqual(sharedCount, 1);
    });
});

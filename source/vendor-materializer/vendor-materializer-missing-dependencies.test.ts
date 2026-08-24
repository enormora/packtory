import assert from 'node:assert';
import { suite, test } from 'mocha';
import { expectErr, expectOk, runWith, setupFileManager } from '../test-libraries/vendor-materializer-test-support.ts';
import { createVendorMaterializer } from './vendor-materializer.ts';

suite('vendor-materializer missing dependencies and modes', function () {
    test('preserves executable mode for vendored files', async function () {
        const result = await runWith(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/leaf' } ],
                listings: [ { value: [ { name: 'bin.js', isDirectory: false, isSymbolicLink: false } ] } ],
                fileReads: [ { value: '{}' } ],
                transferableFileDescriptions: [
                    {
                        value: {
                            sourceFilePath: '/repo/node_modules/leaf/bin.js',
                            targetFilePath: 'node_modules/leaf/bin.js',
                            content: '',
                            isExecutable: true
                        }
                    }
                ]
            },
            { initialDependencyNames: [ 'leaf' ], projectFolder: '/repo' }
        );

        assert.partialDeepStrictEqual(result.entries, [
            {
                sourceAbsolutePath: '/repo/node_modules/leaf/bin.js',
                targetRelativePath: 'node_modules/leaf/bin.js',
                isExecutable: true
            }
        ]);
    });

    test('fails when a required dependency cannot be located in any reachable node_modules ancestor', async function () {
        const fileManager = setupFileManager({
            readabilities: Array.from({ length: 20 }, function () {
                return { value: { isReadable: false } };
            }),
            realPaths: [],
            listings: [],
            fileReads: []
        });
        const materializer = createVendorMaterializer({ fileManager });

        const failure = await materializer.materializeExternals({
            initialDependencyNames: [ 'missing' ],
            projectFolder: '/some/deep/folder'
        });

        assert.deepStrictEqual(expectErr(failure), {
            type: 'dependency-not-found',
            sourcePackageName: undefined,
            dependencyName: 'missing'
        });
        assert.deepStrictEqual(fileManager.getAllCheckReadabilityCalls(), [
            { fileOrFolderPath: '/some/deep/folder/node_modules/missing' },
            { fileOrFolderPath: '/some/deep/node_modules/missing' },
            { fileOrFolderPath: '/some/node_modules/missing' },
            { fileOrFolderPath: '/node_modules/missing' }
        ]);
    });

    test('skips peers that cannot be located so pack can report unsatisfied peers from the closure check', async function () {
        const fileManager = setupFileManager({
            readabilities: [
                { value: { isReadable: true } },
                ...Array.from({ length: 10 }, function () {
                    return { value: { isReadable: false } };
                })
            ],
            realPaths: [ { value: '/repo/node_modules/root' } ],
            listings: [],
            fileReads: [ { value: JSON.stringify({ peerDependencies: { peer: '1.0.0' } }) } ]
        });
        const materializer = createVendorMaterializer({ fileManager });

        const result = expectOk(
            await materializer.materializeExternals({
                initialDependencyNames: [ 'root' ],
                projectFolder: '/repo'
            })
        );

        assert.partialDeepStrictEqual(result, {
            entries: [],
            packageNames: [ 'root' ]
        });
    });

    test('fails when a manifest dependency cannot be located', async function () {
        const fileManager = setupFileManager({
            readabilities: [
                { value: { isReadable: true } },
                ...Array.from({ length: 10 }, function () {
                    return { value: { isReadable: false } };
                })
            ],
            realPaths: [ { value: '/repo/node_modules/root' } ],
            listings: [ { value: [] } ],
            fileReads: [ { value: JSON.stringify({ dependencies: { missing: '1.0.0' } }) } ]
        });
        const materializer = createVendorMaterializer({ fileManager });

        const failure = await materializer.materializeExternals({
            initialDependencyNames: [ 'root' ],
            projectFolder: '/repo'
        });

        assert.deepStrictEqual(expectErr(failure), {
            type: 'dependency-not-found',
            sourcePackageName: 'root',
            dependencyName: 'missing'
        });
    });
});

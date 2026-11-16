import assert from 'node:assert';
import { suite, test } from 'mocha';
import { expectOk, setupFileManager } from '../test-libraries/vendor-materializer-test-support.ts';
import { createVendorMaterializer } from './vendor-materializer.ts';

suite('vendor-materializer dependency sources', function () {
    test('keeps initial dependencies at the bundle root across source folders', async function () {
        const fileManager = setupFileManager({
            readabilities: [ { value: { isReadable: true } }, { value: { isReadable: true } } ],
            realPaths: [ { value: '/repo/a/node_modules/shared' }, { value: '/repo/b/node_modules/shared' } ],
            listings: [
                { value: [ { name: 'first.js', isDirectory: false, isSymbolicLink: false } ] },
                { value: [ { name: 'second.js', isDirectory: false, isSymbolicLink: false } ] }
            ],
            fileReads: [ { value: '{}' }, { value: '{}' } ]
        });
        const result = expectOk(
            await createVendorMaterializer({ fileManager }).materializeExternals({
                dependencySources: [
                    { initialDependencyNames: [ 'shared' ], projectFolder: '/repo/a' },
                    { initialDependencyNames: [ 'shared' ], projectFolder: '/repo/b' }
                ]
            })
        );

        assert.deepStrictEqual(
            result.entries.map(function (entry) {
                return { source: entry.sourceAbsolutePath, target: entry.targetRelativePath };
            }),
            [
                { source: '/repo/a/node_modules/shared/first.js', target: 'node_modules/shared/first.js' },
                { source: '/repo/b/node_modules/shared/second.js', target: 'node_modules/shared/second.js' }
            ]
        );
    });

    test('resolves installed dependencies from each source folder in one deduplicated closure', async function () {
        const fileManager = setupFileManager({
            readabilities: Array.from({ length: 3 }, function () {
                return { value: { isReadable: true } };
            }),
            realPaths: [
                { value: '/repo/a/node_modules/first' },
                { value: '/repo/b/node_modules/second' },
                { value: '/repo/a/node_modules/first' }
            ],
            listings: [
                { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] },
                { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] }
            ],
            fileReads: [ { value: '{}' }, { value: '{}' } ]
        });
        const result = expectOk(
            await createVendorMaterializer({ fileManager }).materializeExternals({
                dependencySources: [
                    { initialDependencyNames: [ 'first' ], projectFolder: '/repo/a' },
                    { initialDependencyNames: [ 'second', 'first' ], projectFolder: '/repo/b' }
                ]
            })
        );

        assert.deepStrictEqual(result.packageNames, [ 'first', 'second' ]);
        assert.deepStrictEqual(
            result.entries.map(function (entry) {
                return entry.sourceAbsolutePath;
            }),
            [
                '/repo/a/node_modules/first/index.js',
                '/repo/b/node_modules/second/index.js'
            ]
        );
        assert.deepStrictEqual(fileManager.getCheckReadabilityCall(1), {
            fileOrFolderPath: '/repo/b/node_modules/second'
        });
    });
});

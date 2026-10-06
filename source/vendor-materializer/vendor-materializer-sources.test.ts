import assert from 'node:assert';
import { suite, test } from 'mocha';
import { expectOk, setupFileManager } from '../test-libraries/vendor-materializer-test-support.ts';
import { createVendorMaterializer } from './vendor-materializer.ts';

suite('vendor-materializer dependency sources', function () {
    test('resolves installed dependencies from each source folder in one deduplicated closure', async function () {
        const fileManager = setupFileManager({
            readabilities: [ { value: { isReadable: true } }, { value: { isReadable: true } } ],
            realPaths: [ { value: '/repo/a/node_modules/first' }, { value: '/repo/b/node_modules/second' } ],
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

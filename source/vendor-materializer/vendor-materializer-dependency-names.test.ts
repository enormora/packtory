import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createVendorMaterializer } from './vendor-materializer.ts';
import {
    expectErr,
    runExpectingFailure,
    runWith,
    setupFileManager
} from './vendor-materializer-test-support.ts';

async function expectInvalidVendoredDependencyFailure(
    dependencies: Readonly<Record<string, string>>,
    invalidDependencyName: string
): Promise<void> {
    const failure = await runExpectingFailure(
        {
            readabilities: [ { value: { isReadable: true } } ],
            realPaths: [ { value: '/repo/node_modules/pkg' } ],
            listings: [ { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] } ],
            fileReads: [ { value: JSON.stringify({ dependencies }) } ]
        },
        { initialDependencyNames: [ 'pkg' ], projectFolder: '/repo' }
    );

    assert.deepStrictEqual(failure, {
        type: 'invalid-dependency-name',
        sourcePackageName: 'pkg',
        invalidDependencyName
    });
}

suite('vendor-materializer dependency names', function () {
    test('rejects a vendored manifest whose dependencies key uses path traversal syntax so the materializer never probes outside node_modules', async function () {
        const failure = await runExpectingFailure(
            {
                readabilities: [ { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/legit-utils' } ],
                listings: [ { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] } ],
                fileReads: [ { value: JSON.stringify({ dependencies: { '../../legit-utils': '*' } }) } ]
            },
            { initialDependencyNames: [ 'legit-utils' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(failure, {
            type: 'invalid-dependency-name',
            sourcePackageName: 'legit-utils',
            invalidDependencyName: '../../legit-utils'
        });
    });

    test('rejects an absolute-path dependency name in a vendored manifest', async function () {
        await expectInvalidVendoredDependencyFailure({ '/etc/passwd': '*' }, '/etc/passwd');
    });

    test('rejects an initial dependency name that is not a valid npm package name without touching the filesystem', async function () {
        const fileManager = setupFileManager({ readabilities: [], realPaths: [], listings: [], fileReads: [] });
        const materializer = createVendorMaterializer({ fileManager });

        const failure = expectErr(
            await materializer.materializeExternals({
                initialDependencyNames: [ '../escape' ],
                projectFolder: '/repo'
            })
        );

        assert.deepStrictEqual(failure, {
            type: 'invalid-dependency-name',
            sourcePackageName: undefined,
            invalidDependencyName: '../escape'
        });
        assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
    });

    test('only flags the offending key when an earlier dependency key is valid and a later one is not parseable', async function () {
        await expectInvalidVendoredDependencyFailure({ 'valid-one': '1.0.0', 'has space': '*' }, 'has space');
    });

    test('accepts a scoped package name in dependency keys', async function () {
        const result = await runWith(
            {
                readabilities: [ { value: { isReadable: true } }, { value: { isReadable: true } } ],
                realPaths: [ { value: '/repo/node_modules/host' }, { value: '/repo/node_modules/@scope/sub' } ],
                listings: [
                    { value: [ { name: 'index.js', isDirectory: false, isSymbolicLink: false } ] },
                    { value: [ { name: 'lib.js', isDirectory: false, isSymbolicLink: false } ] }
                ],
                fileReads: [ { value: JSON.stringify({ dependencies: { '@scope/sub': '*' } }) }, { value: '{}' } ]
            },
            { initialDependencyNames: [ 'host' ], projectFolder: '/repo' }
        );

        assert.deepStrictEqual(result.packageNames, [ 'host', '@scope/sub' ]);
    });
});

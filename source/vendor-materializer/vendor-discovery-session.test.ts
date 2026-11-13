import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { expectOk, targetRelativePaths } from '../test-libraries/vendor-materializer-test-support.ts';
import { createVendorMaterializer, type VendorMaterializer } from './vendor-materializer.ts';

type DiscoveryFixture = {
    readonly fileManager: FakeFileManager;
    readonly materializer: VendorMaterializer;
};

const options = { dependencySources: [ { projectFolder: '/repo', initialDependencyNames: [ 'package' ] } ] };

function discoveryFixture(fileNames: readonly string[]): DiscoveryFixture {
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: fileNames.map(function () {
            return { value: '{}' };
        }),
        simulatedListDirectoryResponses: fileNames.map(function (name) {
            return { value: [ { name, isDirectory: false, isSymbolicLink: false } ] };
        })
    });
    return { fileManager, materializer: createVendorMaterializer({ fileManager }) };
}

suite('vendor discovery sessions', function () {
    test('reuses identical inventories without reading payloads', async function () {
        const { fileManager, materializer } = discoveryFixture([ 'index.js' ]);
        const session = materializer.createSession();
        const first = expectOk(await session.materializeExternals(options));
        assert.deepStrictEqual(expectOk(await session.materializeExternals(options)), first);
        assert.strictEqual(fileManager.getReadFileCallCount(), 1);
        assert.strictEqual(fileManager.getListDirectoryCallCount(), 1);
        assert.strictEqual(fileManager.getTransferableFileDescriptionCallCount(), 0);
    });

    test('shares metadata across overlapping dependency closures', async function () {
        const { fileManager, materializer } = discoveryFixture([ 'index.js', 'another.js' ]);
        const session = materializer.createSession();
        await session.materializeExternals(options);
        const overlapping = expectOk(
            await session.materializeExternals({
                dependencySources: [ { projectFolder: '/repo', initialDependencyNames: [ 'package', 'another' ] } ]
            })
        );
        assert.deepStrictEqual(targetRelativePaths(overlapping), [
            'node_modules/package/index.js',
            'node_modules/another/another.js'
        ]);
        assert.strictEqual(fileManager.getReadFileCallCount(), 2);
        assert.strictEqual(fileManager.getListDirectoryCallCount(), 2);
    });

    test('discovers changed files in the next session', async function () {
        const { fileManager, materializer } = discoveryFixture([ 'index.js', 'changed.js' ]);
        const first = expectOk(await materializer.createSession().materializeExternals(options));
        assert.deepStrictEqual(targetRelativePaths(first), [ 'node_modules/package/index.js' ]);
        const next = expectOk(await materializer.createSession().materializeExternals(options));
        assert.deepStrictEqual(targetRelativePaths(next), [ 'node_modules/package/changed.js' ]);
        assert.strictEqual(fileManager.getReadFileCallCount(), 2);
        assert.strictEqual(fileManager.getListDirectoryCallCount(), 2);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { extractPackageTarball } from './extract-package-tarball.ts';

suite('extract-package-tarball', function () {
    test('returns an empty array when the given tarball is empty', async function () {
        const tarballBuilder = createTarballBuilder();
        const tarball = await tarballBuilder.build([]);
        const files = await extractPackageTarball(tarball);

        assert.deepStrictEqual(files, []);
    });

    test('returns the extracted file descriptions when the given tarball is not empty', async function () {
        const tarballBuilder = createTarballBuilder();
        const tarball = await tarballBuilder.build([{ filePath: 'foo', content: 'bar', isExecutable: true }]);
        const files = await extractPackageTarball(tarball);

        assert.deepStrictEqual(files, [{ filePath: 'foo', content: 'bar', isExecutable: true }]);
    });

    test('marks extracted files as non-executable when the tar header has no executable mode', async function () {
        const tarballBuilder = createTarballBuilder();
        const tarball = await tarballBuilder.build([{ filePath: 'foo', content: 'bar', isExecutable: false }]);
        const files = await extractPackageTarball(tarball);

        assert.deepStrictEqual(files, [{ filePath: 'foo', content: 'bar', isExecutable: false }]);
    });
});

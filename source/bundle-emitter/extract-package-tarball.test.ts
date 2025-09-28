import test from 'ava';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { extractPackageTarball } from './extract-package-tarball.ts';

test('returns an empty array when the given tarball is empty', async (t) => {
    const tarballBuilder = createTarballBuilder();
    const tarball = await tarballBuilder.build([]);
    const files = await extractPackageTarball(tarball);

    t.deepEqual(files, []);
});

test('returns the extracted file descriptions when the given tarball is not empty', async (t) => {
    const tarballBuilder = createTarballBuilder();
    const tarball = await tarballBuilder.build([{ filePath: 'foo', content: 'bar', isExecutable: true }]);
    const files = await extractPackageTarball(tarball);

    t.deepEqual(files, [{ filePath: 'foo', content: 'bar', isExecutable: true }]);
});

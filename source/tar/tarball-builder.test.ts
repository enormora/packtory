import assert from 'node:assert';
import zlib from 'node:zlib';
import { test } from 'mocha';
import sinon from 'sinon';
import { extractTarEntries } from './extract-tar.ts';
import { createTarballBuilder } from './tarball-builder.ts';

test('creates an empty tarball', async () => {
    const builder = createTarballBuilder();
    const tarballBuffer = await builder.build([]);
    const entries = await extractTarEntries(tarballBuffer);

    assert.deepStrictEqual(entries, []);
});

test('creates a tarball with one file', async () => {
    const builder = createTarballBuilder();

    const tarballBuffer = await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);
    const entries = await extractTarEntries(tarballBuffer);

    assert.deepStrictEqual(entries, [
        {
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 420,
                mtime: new Date(0),
                name: 'foo.txt',
                pax: null,
                size: 3,
                type: 'file',
                uid: 0,
                uname: ''
            },
            content: 'bar'
        }
    ]);
});

test('sets the file mode in the tar header correctly when the file is executable', async () => {
    const builder = createTarballBuilder();

    const tarballBuffer = await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: true }]);
    const entries = await extractTarEntries(tarballBuffer);

    assert.deepStrictEqual(entries, [
        {
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 493,
                mtime: new Date(0),
                name: 'foo.txt',
                pax: null,
                size: 3,
                type: 'file',
                uid: 0,
                uname: ''
            },
            content: 'bar'
        }
    ]);
});

test('creates a tarball with many nested files', async () => {
    const builder = createTarballBuilder();

    const tarballBuffer = await builder.build([
        { filePath: '1.txt', content: '1', isExecutable: false },
        { filePath: 'foo/2.txt', content: '2', isExecutable: false },
        { filePath: 'foo/bar/3.txt', content: '3', isExecutable: false },
        { filePath: 'foo/bar/baz/4.txt', content: '4', isExecutable: false }
    ]);
    const entries = await extractTarEntries(tarballBuffer);
    const expectedBaseHeaders = {
        devmajor: 0,
        devminor: 0,
        gid: 0,
        gname: '',
        linkname: null,
        mode: 420,
        mtime: new Date(0),
        pax: null,
        uid: 0,
        uname: '',
        type: 'file'
    } as const;

    assert.deepStrictEqual(entries, [
        {
            header: {
                ...expectedBaseHeaders,
                name: '1.txt',
                size: 1
            },
            content: '1'
        },
        {
            header: {
                ...expectedBaseHeaders,
                name: 'foo/2.txt',
                size: 1
            },
            content: '2'
        },
        {
            header: {
                ...expectedBaseHeaders,
                name: 'foo/bar/3.txt',
                size: 1
            },
            content: '3'
        },
        {
            header: {
                ...expectedBaseHeaders,
                name: 'foo/bar/baz/4.txt',
                size: 1
            },
            content: '4'
        }
    ]);
});

test('creates gzip streams with the maximum compression level', async () => {
    const createGzip = sinon.spy(zlib, 'createGzip');

    try {
        const builder = createTarballBuilder();
        await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);

        assert.deepStrictEqual(createGzip.firstCall.args, [{ level: 9 }]);
    } finally {
        createGzip.restore();
    }
});

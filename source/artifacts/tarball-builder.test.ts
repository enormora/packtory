import test from 'node:test';
import assert from 'node:assert';
import { createTarballBuilder } from './tarball-builder.js';
import { extractTarEntries } from '../test-libraries/tar.js';

test('creates an empty tarball', async () => {
    const builder = createTarballBuilder();
    const tarballBuffer = await builder.build();
    const entries = await extractTarEntries(tarballBuffer);

    assert.deepEqual(entries, []);
});

test('creates a tarball with one file', async () => {
    const builder = createTarballBuilder();

    builder.addFile('foo.txt', 'bar');
    const tarballBuffer = await builder.build();
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
                uname: '',
            },
            content: 'bar',
        },
    ]);
});

test('creates a tarball with many nested files', async () => {
    const builder = createTarballBuilder();

    builder.addFile('1.txt', '1');
    builder.addFile('foo/2.txt', '2');
    builder.addFile('foo/bar/3.txt', '3');
    builder.addFile('foo/bar/baz/4.txt', '4');
    const tarballBuffer = await builder.build();
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
                name: '1.txt',
                pax: null,
                size: 1,
                type: 'file',
                uid: 0,
                uname: '',
            },
            content: '1',
        },
        {
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 420,
                mtime: new Date(0),
                name: 'foo/2.txt',
                pax: null,
                size: 1,
                type: 'file',
                uid: 0,
                uname: '',
            },
            content: '2',
        },
        {
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 420,
                mtime: new Date(0),
                name: 'foo/bar/3.txt',
                pax: null,
                size: 1,
                type: 'file',
                uid: 0,
                uname: '',
            },
            content: '3',
        },
        {
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 420,
                mtime: new Date(0),
                name: 'foo/bar/baz/4.txt',
                pax: null,
                size: 1,
                type: 'file',
                uid: 0,
                uname: '',
            },
            content: '4',
        },
    ]);
});

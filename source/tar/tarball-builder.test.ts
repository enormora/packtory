import test from 'ava';
import { extractTarEntries } from './extract-tar.js';
import { createTarballBuilder } from './tarball-builder.js';

test('creates an empty tarball', async (t) => {
    const builder = createTarballBuilder();
    const tarballBuffer = await builder.build([]);
    const entries = await extractTarEntries(tarballBuffer);

    t.deepEqual(entries, []);
});

test('creates a tarball with one file', async (t) => {
    const builder = createTarballBuilder();

    const tarballBuffer = await builder.build([{ filePath: 'foo.txt', content: 'bar' }]);
    const entries = await extractTarEntries(tarballBuffer);

    t.deepEqual(entries, [
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

test('creates a tarball with many nested files', async (t) => {
    const builder = createTarballBuilder();

    const tarballBuffer = await builder.build([
        { filePath: '1.txt', content: '1' },
        { filePath: 'foo/2.txt', content: '2' },
        { filePath: 'foo/bar/3.txt', content: '3' },
        { filePath: 'foo/bar/baz/4.txt', content: '4' }
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

    t.deepEqual(entries, [
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

import test from 'ava';
import { extractTarEntries } from './extract-tar.ts';
import { createTarballBuilder } from './tarball-builder.ts';

test('returns an empty array when the given tar buffer has no files', async (t) => {
    const builder = createTarballBuilder();
    const tar = await builder.build([]);
    const entries = await extractTarEntries(tar);

    t.deepEqual(entries, []);
});

test('returns the extracted entries when the given tar buffer has files', async (t) => {
    const builder = createTarballBuilder();
    const tar = await builder.build([{ filePath: 'foo', content: 'bar', isExecutable: false }]);
    const entries = await extractTarEntries(tar);

    t.deepEqual(entries, [
        {
            content: 'bar',
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 420,
                mtime: new Date(0),
                name: 'foo',
                pax: null,
                size: 3,
                type: 'file',
                uid: 0,
                uname: ''
            }
        }
    ]);
});

test('returns the extracted entries when the given tar buffer has files which are executable', async (t) => {
    const builder = createTarballBuilder();
    const tar = await builder.build([{ filePath: 'foo', content: 'bar', isExecutable: true }]);
    const entries = await extractTarEntries(tar);

    t.deepEqual(entries, [
        {
            content: 'bar',
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 493,
                mtime: new Date(0),
                name: 'foo',
                pax: null,
                size: 3,
                type: 'file',
                uid: 0,
                uname: ''
            }
        }
    ]);
});

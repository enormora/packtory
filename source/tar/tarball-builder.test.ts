import assert from 'node:assert';
import zlib from 'node:zlib';
import { suite, test } from 'mocha';
import sinon from 'sinon';
import { withPromiseDeadline } from '../test-libraries/promise-with-deadline.ts';
import { extractTarEntries } from './extract-tar.ts';
import { createTarballBuilder } from './tarball-builder.ts';

suite('tarball-builder', function () {
    test('creates an empty tarball', async function () {
        const builder = createTarballBuilder();
        const tarballBuffer = await builder.build([]);
        const entries = await withPromiseDeadline(extractTarEntries(tarballBuffer), 'empty tarball builder extraction');

        assert.deepStrictEqual(entries, []);
    });

    test('creates a tarball with one file', async function () {
        const builder = createTarballBuilder();

        const tarballBuffer = await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);
        const entries = await withPromiseDeadline(
            extractTarEntries(tarballBuffer),
            'single-file tarball builder extraction'
        );

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

    test('sets the file mode in the tar header correctly when the file is executable', async function () {
        const builder = createTarballBuilder();

        const tarballBuffer = await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: true }]);
        const entries = await withPromiseDeadline(
            extractTarEntries(tarballBuffer),
            'executable tarball builder extraction'
        );

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

    test('creates a tarball with many nested files', async function () {
        const builder = createTarballBuilder();

        const tarballBuffer = await builder.build([
            { filePath: '1.txt', content: '1', isExecutable: false },
            { filePath: 'foo/2.txt', content: '2', isExecutable: false },
            { filePath: 'foo/bar/3.txt', content: '3', isExecutable: false },
            { filePath: 'foo/bar/baz/4.txt', content: '4', isExecutable: false }
        ]);
        const entries = await withPromiseDeadline(
            extractTarEntries(tarballBuffer),
            'nested tarball builder extraction'
        );
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

    test('creates gzip streams with the maximum compression level', async function () {
        const createGzip = sinon.spy((options?: zlib.ZlibOptions) => {
            return zlib.createGzip(options);
        });
        const builder = createTarballBuilder({ createGzip });
        await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);

        assert.deepStrictEqual(createGzip.firstCall.args, [{ level: 9 }]);
    });

    test('includes vendor entries with raw bytes from the file manager alongside inline file descriptions', async function () {
        const builder = createTarballBuilder({
            fileManager: {
                readFileBytes: async () => {
                    return Buffer.from('vendored-bytes', 'utf8');
                }
            }
        });

        const tarballBuffer = await builder.build(
            [{ filePath: 'index.js', content: 'console.log(0);', isExecutable: false }],
            [
                {
                    sourceAbsolutePath: '/repo/node_modules/pkg/dist/main.js',
                    targetRelativePath: 'node_modules/pkg/main.js',
                    isExecutable: false
                }
            ]
        );
        const entries = await withPromiseDeadline(extractTarEntries(tarballBuffer), 'vendor tar extraction');

        const names = entries.map((entry) => {
            return entry.header.name;
        });
        assert.deepStrictEqual(names, ['index.js', 'node_modules/pkg/main.js']);
        const vendorEntry = entries.find((entry) => {
            return entry.header.name === 'node_modules/pkg/main.js';
        });
        assert.ok(vendorEntry);
        assert.strictEqual(vendorEntry.content, 'vendored-bytes');
    });

    test('marks executable vendor entries with the executable mode in the tarball', async function () {
        const builder = createTarballBuilder({
            fileManager: {
                readFileBytes: async () => {
                    return Buffer.from('#!/bin/sh', 'utf8');
                }
            }
        });

        const tarballBuffer = await builder.build(
            [],
            [
                {
                    sourceAbsolutePath: '/repo/bin/run.sh',
                    targetRelativePath: 'node_modules/pkg/bin/run.sh',
                    isExecutable: true
                }
            ]
        );
        const [entry] = await withPromiseDeadline(extractTarEntries(tarballBuffer), 'executable vendor tar extraction');
        assert.ok(entry);
        assert.strictEqual(entry.header.mode, 493);
    });

    test('rejects vendor materialization when no file manager is wired into the tarball builder', async function () {
        const builder = createTarballBuilder();
        const vendorEntry = {
            sourceAbsolutePath: '/missing',
            targetRelativePath: 'node_modules/pkg/lib.js',
            isExecutable: false
        };
        let capturedMessage = '';
        try {
            await builder.build([], [vendorEntry]);
            assert.fail('expected build() to reject because the tarball builder lacks readFileBytes');
        } catch (error: unknown) {
            capturedMessage = (error as Error).message;
        }
        assert.strictEqual(capturedMessage, 'readFileBytes is required to materialize vendor entries into the tarball');
    });
});

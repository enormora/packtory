import assert from 'node:assert';
import { Readable } from 'node:stream';
import { test } from 'mocha';
import sinon from 'sinon';
import { extractTarEntries } from './extract-tar.ts';
import { createTarballBuilder } from './tarball-builder.ts';

test('returns an empty array when the given tar buffer has no files', async () => {
    const builder = createTarballBuilder();
    const tar = await builder.build([]);
    const entries = await extractTarEntries(tar);

    assert.deepStrictEqual(entries, []);
});

test('returns the extracted entries when the given tar buffer has files', async () => {
    const builder = createTarballBuilder();
    const tar = await builder.build([{ filePath: 'foo', content: 'bar', isExecutable: false }]);
    const entries = await extractTarEntries(tar);

    assert.deepStrictEqual(entries, [
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

test('returns the extracted entries when the given tar buffer has files which are executable', async () => {
    const builder = createTarballBuilder();
    const tar = await builder.build([{ filePath: 'foo', content: 'bar', isExecutable: true }]);
    const entries = await extractTarEntries(tar);

    assert.deepStrictEqual(entries, [
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

test('returns every extracted entry in tar order when the tarball contains multiple files', async () => {
    const builder = createTarballBuilder();
    const tar = await builder.build([
        { filePath: 'first.txt', content: 'first', isExecutable: false },
        { filePath: 'second.txt', content: 'second', isExecutable: false }
    ]);

    const entries = await extractTarEntries(tar);

    assert.deepStrictEqual(
        entries.map((entry) => {
            return [entry.header.name, entry.content];
        }),
        [
            ['first.txt', 'first'],
            ['second.txt', 'second']
        ]
    );
});

test('rejects when the given buffer is not a valid gzip tarball', async () => {
    await assert.rejects(async () => {
        await extractTarEntries(Buffer.from('not-a-tarball'));
    }, Error);
});

test('rejects with an Error when iteration throws a non-Error value', async () => {
    const throwingStream = {
        [Symbol.asyncIterator](): AsyncIterator<unknown> {
            return {
                next: async (): Promise<IteratorResult<unknown>> => {
                    // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- This test exercises non-Error rejection normalization.
                    throw 'boom';
                }
            };
        }
    };
    const intermediateStream = {
        pipe() {
            return throwingStream;
        }
    };
    const source = {
        once() {
            return source;
        },
        pipe() {
            return intermediateStream;
        }
    };
    const stub = sinon.stub(Readable, 'from').returns(source as unknown as Readable);

    try {
        await assert.rejects(async () => {
            await extractTarEntries(Buffer.from('unused'));
        }, /^Error: boom$/);
    } finally {
        stub.restore();
    }
});

test('preserves Error instances when iteration rejects with an Error', async () => {
    const throwingStream = {
        [Symbol.asyncIterator](): AsyncIterator<unknown> {
            return {
                next: async (): Promise<IteratorResult<unknown>> => {
                    throw new Error('boom');
                }
            };
        }
    };
    const intermediateStream = {
        pipe() {
            return throwingStream;
        }
    };
    const source = {
        once() {
            return source;
        },
        pipe() {
            return intermediateStream;
        }
    };
    const stub = sinon.stub(Readable, 'from').returns(source as unknown as Readable);

    try {
        await assert.rejects(async () => {
            await extractTarEntries(Buffer.from('unused'));
        }, /^Error: boom$/);
    } finally {
        stub.restore();
    }
});

test('registers the shared error event handler on the source stream', async () => {
    const sourceOnce = sinon.spy();
    const extractStream = {
        once() {
            return extractStream;
        },
        pipe() {
            return extractStream;
        },
        [Symbol.asyncIterator](): AsyncIterator<unknown> {
            return {
                next: async (): Promise<IteratorResult<unknown>> => {
                    return { done: true, value: undefined };
                }
            };
        }
    };
    const gunzip = {
        once() {
            return gunzip;
        },
        pipe() {
            return extractStream;
        }
    };
    const source = {
        once: sourceOnce,
        pipe() {
            return gunzip;
        }
    };
    const readableStub = sinon.stub(Readable, 'from').returns(source as unknown as Readable);

    try {
        const entries = await extractTarEntries(Buffer.from('unused'));

        assert.deepStrictEqual(entries, []);
        assert.strictEqual(sourceOnce.firstCall.firstArg, 'error');
    } finally {
        readableStub.restore();
    }
});

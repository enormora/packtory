import assert from 'node:assert';
import { Readable } from 'node:stream';
import { test } from 'mocha';
import sinon from 'sinon';
import { extractTarEntries } from './extract-tar.ts';
import { createTarballBuilder } from './tarball-builder.ts';

async function expectFailure(action: () => Promise<unknown>, expectedError: RegExp | 'error'): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        if (expectedError === 'error') {
            assert.ok(error instanceof Error);
            return;
        }

        assert.match(String(error), expectedError);
    }
}

test('returns an empty array when the given tar buffer has no files', async () => {
    const builder = createTarballBuilder();
    const tar = await builder.build([]);
    const entries = await extractTarEntries(tar);

    assert.deepStrictEqual(entries, []);
});

function expectedSingleFileEntry(mode: number): unknown[] {
    return [
        {
            content: 'bar',
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode,
                mtime: new Date(0),
                name: 'foo',
                pax: null,
                size: 3,
                type: 'file',
                uid: 0,
                uname: ''
            }
        }
    ];
}

test('returns the extracted entries when the given tar buffer has files', async () => {
    const builder = createTarballBuilder();
    const tar = await builder.build([{ filePath: 'foo', content: 'bar', isExecutable: false }]);
    const entries = await extractTarEntries(tar);

    assert.deepStrictEqual(entries, expectedSingleFileEntry(420));
});

test('returns the extracted entries when the given tar buffer has files which are executable', async () => {
    const builder = createTarballBuilder();
    const tar = await builder.build([{ filePath: 'foo', content: 'bar', isExecutable: true }]);
    const entries = await extractTarEntries(tar);

    assert.deepStrictEqual(entries, expectedSingleFileEntry(493));
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
    await expectFailure(async () => {
        await extractTarEntries(Buffer.from('not-a-tarball'));
    }, 'error');
});

async function runWithThrowingStream(thrown: () => never, expectedError: RegExp): Promise<void> {
    const throwingStream = {
        [Symbol.asyncIterator](): AsyncIterator<unknown> {
            return {
                async next(): Promise<IteratorResult<unknown>> {
                    thrown();
                }
            };
        }
    };
    const intermediateStream = { pipe: () => throwingStream };
    const source = {
        once() {
            return source;
        },
        pipe: () => intermediateStream
    };
    const stub = sinon.stub(Readable, 'from').returns(source as unknown as Readable);

    try {
        await expectFailure(async () => {
            await extractTarEntries(Buffer.from('unused'));
        }, expectedError);
    } finally {
        stub.restore();
    }
}

test('rejects with an Error when iteration throws a non-Error value', async () => {
    await runWithThrowingStream(() => {
        // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- This test exercises non-Error rejection normalization.
        throw 'boom';
    }, /^Error: boom$/u);
});

test('preserves Error instances when iteration rejects with an Error', async () => {
    await runWithThrowingStream(() => {
        throw new Error('boom');
    }, /^Error: boom$/u);
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

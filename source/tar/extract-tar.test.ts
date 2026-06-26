import assert from 'node:assert';
import type { Readable } from 'node:stream';
import { suite, test } from 'mocha';
import sinon from 'sinon';
import { withPromiseDeadline } from '../test-libraries/promise-with-deadline.ts';
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

async function buildTwoFileTar(): Promise<Buffer> {
    const builder = createTarballBuilder();
    return await builder.build([
        { filePath: 'first.txt', content: 'first', isExecutable: false },
        { filePath: 'second.txt', content: 'second', isExecutable: false }
    ]);
}

async function extractSingleFile(
    filePath: string,
    content: string,
    limits: Parameters<typeof extractTarEntries>[2]
): Promise<Awaited<ReturnType<typeof extractTarEntries>>> {
    const builder = createTarballBuilder();
    const tar = await builder.build([{ filePath, content, isExecutable: false }]);
    return await extractTarEntries(tar, {}, limits);
}

suite('extract-tar', function () {
    test('returns an empty array when the given tar buffer has no files', async function () {
        const builder = createTarballBuilder();
        const tar = await builder.build([]);
        const entries = await withPromiseDeadline(extractTarEntries(tar), 'empty tar extraction');

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

    test('returns the extracted entries when the given tar buffer has files', async function () {
        const builder = createTarballBuilder();
        const tar = await builder.build([{ filePath: 'foo', content: 'bar', isExecutable: false }]);
        const entries = await withPromiseDeadline(extractTarEntries(tar), 'single-file tar extraction');

        assert.deepStrictEqual(entries, expectedSingleFileEntry(420));
    });

    test('returns the extracted entries when the given tar buffer has files which are executable', async function () {
        const builder = createTarballBuilder();
        const tar = await builder.build([{ filePath: 'foo', content: 'bar', isExecutable: true }]);
        const entries = await withPromiseDeadline(extractTarEntries(tar), 'executable tar extraction');

        assert.deepStrictEqual(entries, expectedSingleFileEntry(493));
    });

    test('returns every extracted entry in tar order when the tarball contains multiple files', async function () {
        const tar = await buildTwoFileTar();

        const entries = await withPromiseDeadline(extractTarEntries(tar), 'multi-file tar extraction');

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

    test('rejects tarballs with too many entries', async function () {
        const tar = await buildTwoFileTar();

        await expectFailure(async () => {
            await extractTarEntries(tar, {}, { maxEntryCount: 1, maxEntryPathLength: 4096, maxExtractedBytes: 1024 });
        }, /^Error: Refusing to extract tarball with more than 1 entries$/u);
    });

    test('rejects tarballs with paths above the configured length limit', async function () {
        const builder = createTarballBuilder();
        const tar = await builder.build([{ filePath: 'long-file-name.txt', content: 'content', isExecutable: false }]);

        await expectFailure(async () => {
            await extractTarEntries(tar, {}, { maxEntryCount: 1, maxEntryPathLength: 8, maxExtractedBytes: 1024 });
        }, /^Error: Refusing to extract tarball entry with path longer than 8 characters$/u);
    });

    test('rejects tarballs with paths above the default length limit', async function () {
        const builder = createTarballBuilder();
        const tar = await builder.build([{ filePath: 'a'.repeat(4097), content: 'content', isExecutable: false }]);

        await expectFailure(async () => {
            await extractTarEntries(tar);
        }, /^Error: Refusing to extract tarball entry with path longer than 4096 characters$/u);
    });

    test('accepts tarballs with paths at the configured length limit', async function () {
        const entries = await extractSingleFile('12345678', 'content', {
            maxEntryCount: 1,
            maxEntryPathLength: 8,
            maxExtractedBytes: 1024
        });

        assert.deepStrictEqual(
            entries.map((entry) => {
                return entry.header.name;
            }),
            ['12345678']
        );
    });

    test('rejects tarballs whose extracted content exceeds the configured size limit', async function () {
        const builder = createTarballBuilder();
        const tar = await builder.build([{ filePath: 'file.txt', content: 'content', isExecutable: false }]);

        await expectFailure(async () => {
            await extractTarEntries(tar, {}, { maxEntryCount: 1, maxEntryPathLength: 4096, maxExtractedBytes: 3 });
        }, /^Error: Refusing to extract tarball larger than 3 bytes$/u);
    });

    test('accepts tarballs whose extracted content equals the configured size limit', async function () {
        const entries = await extractSingleFile('file.txt', 'content', {
            maxEntryCount: 1,
            maxEntryPathLength: 4096,
            maxExtractedBytes: 7
        });

        assert.deepStrictEqual(
            entries.map((entry) => {
                return entry.content;
            }),
            ['content']
        );
    });

    test('rejects when the given buffer is not a valid gzip tarball', async function () {
        await expectFailure(async () => {
            await withPromiseDeadline(extractTarEntries(Buffer.from('not-a-tarball')), 'invalid tar extraction');
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
        await expectFailure(async () => {
            await withPromiseDeadline(
                extractTarEntries(Buffer.from('unused'), {
                    createSource: () => source as unknown as Readable
                }),
                'throwing tar extraction'
            );
        }, expectedError);
    }

    test('rejects with an Error when iteration throws a non-Error value', async function () {
        await runWithThrowingStream(() => {
            // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- This test exercises non-Error rejection normalization.
            throw 'boom';
        }, /^Error: boom$/u);
    });

    test('preserves Error instances when iteration rejects with an Error', async function () {
        await runWithThrowingStream(() => {
            throw new Error('boom');
        }, /^Error: boom$/u);
    });

    test('registers the shared error event handler on the source stream', async function () {
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
        const entries = await withPromiseDeadline(
            extractTarEntries(Buffer.from('unused'), {
                createSource: () => source as unknown as Readable
            }),
            'source stream error registration'
        );

        assert.deepStrictEqual(entries, []);
        assert.strictEqual(sourceOnce.firstCall.firstArg, 'error');
    });

    test('rejects when the injected source stream emits an error event', async function () {
        let sourceErrorListener = (error: unknown): void => {
            throw new Error(`expected the source error listener to be registered before piping: ${String(error)}`);
        };
        const extractStream = {
            once() {
                return extractStream;
            },
            [Symbol.asyncIterator](): AsyncIterator<unknown> {
                return {
                    next: async (): Promise<IteratorResult<unknown>> => {
                        return await new Promise<IteratorResult<unknown>>(() => {
                            // keep pending so the error race decides the outcome
                        });
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
            once(_eventName: 'error', listener: (error: unknown) => void) {
                sourceErrorListener = listener;
                return source;
            },
            pipe() {
                queueMicrotask(() => {
                    sourceErrorListener(new Error('source boom'));
                });
                return gunzip;
            }
        };

        await expectFailure(async () => {
            await withPromiseDeadline(
                extractTarEntries(Buffer.from('unused'), {
                    createSource: () => source as unknown as Readable
                }),
                'source stream error event'
            );
        }, /^Error: source boom$/u);
    });
});

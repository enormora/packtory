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

function keepPending(): void {
    return undefined;
}

type FakeTarEntryInput = {
    readonly name: string;
    readonly chunks: readonly { readonly length: number; readonly content: string; }[];
};
type FakeTarChunk = {
    readonly length: number;
    readonly toString: () => string;
};
type FakeTarEntry = {
    readonly header: { readonly name: string; };
    readonly [Symbol.asyncIterator]: () => AsyncGenerator<FakeTarChunk>;
};
type ExtractFakeTarLimits = {
    readonly maxEntryCount: number;
    readonly maxEntryPathLength: number;
    readonly maxExtractedBytes: number;
};

async function* fakeTarChunks(chunks: FakeTarEntryInput['chunks']): AsyncGenerator<FakeTarChunk> {
    for (const chunk of chunks) {
        const fakeChunk: FakeTarChunk = {
            length: chunk.length,
            toString() {
                return chunk.content;
            }
        };
        yield fakeChunk;
    }
}

function createFakeTarEntry(input: FakeTarEntryInput): FakeTarEntry {
    return {
        header: { name: input.name },
        [Symbol.asyncIterator]() {
            return fakeTarChunks(input.chunks);
        }
    };
}

async function* fakeTarEntries(entries: readonly FakeTarEntryInput[]): AsyncGenerator<FakeTarEntry> {
    for (const entry of entries) {
        yield createFakeTarEntry(entry);
    }
}

function createFakeTarSource(entries: readonly FakeTarEntryInput[]): Readable {
    const tarEntries = {
        [Symbol.asyncIterator]() {
            return fakeTarEntries(entries);
        }
    };
    const intermediateStream = {
        pipe() {
            return tarEntries;
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
    return source as unknown as Readable;
}

async function extractFakeTarEntries(
    entries: readonly FakeTarEntryInput[],
    limits?: ExtractFakeTarLimits
): Promise<unknown> {
    return await extractTarEntries(
        Buffer.from('unused'),
        {
            createSource() {
                return createFakeTarSource(entries);
            }
        },
        limits
    );
}

suite('extract-tar', function () {
    suite('successful extraction', function () {
        test('returns an empty array when the given tar buffer has no files', async function () {
            const builder = createTarballBuilder();
            const tar = await builder.build([]);
            const entries = await withPromiseDeadline(extractTarEntries(tar), 'empty tar extraction');

            assert.deepStrictEqual(entries, []);
        });

        test('returns the extracted entries when the given tar buffer has files', async function () {
            const builder = createTarballBuilder();
            const tar = await builder.build([ { filePath: 'foo', content: 'bar', isExecutable: false } ]);
            const entries = await withPromiseDeadline(extractTarEntries(tar), 'single-file tar extraction');

            assert.deepStrictEqual(entries, expectedSingleFileEntry(420));
        });

        test('returns the extracted entries when the given tar buffer has files which are executable', async function () {
            const builder = createTarballBuilder();
            const tar = await builder.build([ { filePath: 'foo', content: 'bar', isExecutable: true } ]);
            const entries = await withPromiseDeadline(extractTarEntries(tar), 'executable tar extraction');

            assert.deepStrictEqual(entries, expectedSingleFileEntry(493));
        });

        test('returns every extracted entry in tar order when the tarball contains multiple files', async function () {
            const builder = createTarballBuilder();
            const tar = await builder.build([
                { filePath: 'first.txt', content: 'first', isExecutable: false },
                { filePath: 'second.txt', content: 'second', isExecutable: false }
            ]);

            const entries = await withPromiseDeadline(extractTarEntries(tar), 'multi-file tar extraction');

            assert.deepStrictEqual(
                entries.map(function (entry) {
                    return [ entry.header.name, entry.content ];
                }),
                [
                    [ 'first.txt', 'first' ],
                    [ 'second.txt', 'second' ]
                ]
            );
        });
    });

    suite('limits', function () {
        test('rejects when the given buffer is not a valid gzip tarball', async function () {
            await expectFailure(async function () {
                await withPromiseDeadline(extractTarEntries(Buffer.from('not-a-tarball')), 'invalid tar extraction');
            }, 'error');
        });

        test('rejects when the tar entry count reaches the configured limit', async function () {
            await expectFailure(async function () {
                await extractFakeTarEntries([
                    { name: 'first.txt', chunks: [] },
                    { name: 'second.txt', chunks: [] }
                ], { maxEntryCount: 1, maxEntryPathLength: 100, maxExtractedBytes: 100 });
            }, /Refusing to extract tarball with more than 1 entries/u);
        });

        test('allows paths at the configured path length limit', async function () {
            const entries = await extractFakeTarEntries(
                [ { name: 'a'.repeat(4), chunks: [ { length: 1, content: 'x' } ] } ],
                { maxEntryCount: 2, maxEntryPathLength: 4, maxExtractedBytes: 10 }
            );

            assert.deepStrictEqual(entries, [
                { header: { name: 'aaaa' }, content: 'x' }
            ]);
        });

        test('rejects paths longer than the configured path length limit', async function () {
            await expectFailure(async function () {
                await extractFakeTarEntries(
                    [ { name: 'a'.repeat(5), chunks: [] } ],
                    { maxEntryCount: 2, maxEntryPathLength: 4, maxExtractedBytes: 10 }
                );
            }, /Refusing to extract tarball entry with path longer than 4 characters/u);
        });

        test('rejects when extracted bytes across entries exceed the configured limit', async function () {
            await expectFailure(async function () {
                await extractFakeTarEntries([
                    { name: 'first.txt', chunks: [ { length: 3, content: 'abc' } ] },
                    { name: 'second.txt', chunks: [ { length: 3, content: 'def' } ] }
                ], { maxEntryCount: 3, maxEntryPathLength: 100, maxExtractedBytes: 5 });
            }, /Refusing to extract tarball larger than 5 bytes/u);
        });

        test('allows extracted bytes equal to the configured limit', async function () {
            const entries = await extractFakeTarEntries([
                { name: 'first.txt', chunks: [ { length: 3, content: 'abc' } ] },
                { name: 'second.txt', chunks: [ { length: 2, content: 'de' } ] }
            ], { maxEntryCount: 3, maxEntryPathLength: 100, maxExtractedBytes: 5 });

            assert.deepStrictEqual(entries, [
                { header: { name: 'first.txt' }, content: 'abc' },
                { header: { name: 'second.txt' }, content: 'de' }
            ]);
        });

        test('applies the default extracted-byte limit', async function () {
            await expectFailure(async function () {
                await extractFakeTarEntries([
                    {
                        name: 'huge.txt',
                        chunks: [ { length: 1_073_741_825, content: '' } ]
                    }
                ]);
            }, /Refusing to extract tarball larger than 1073741824 bytes/u);
        });
    });

    suite('stream failures', function () {
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
            await expectFailure(async function () {
                await withPromiseDeadline(
                    extractTarEntries(Buffer.from('unused'), {
                        createSource() {
                            return source as unknown as Readable;
                        }
                    }),
                    'throwing tar extraction'
                );
            }, expectedError);
        }

        test('rejects with an Error when iteration throws a non-Error value', async function () {
            await runWithThrowingStream(function () {
                // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- This test exercises non-Error rejection normalization.
                throw 'boom';
            }, /^Error: boom$/u);
        });

        test('preserves Error instances when iteration rejects with an Error', async function () {
            await runWithThrowingStream(function () {
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
                        async next(): Promise<IteratorResult<unknown>> {
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
                    createSource() {
                        return source as unknown as Readable;
                    }
                }),
                'source stream error registration'
            );

            assert.deepStrictEqual(entries, []);
            assert.strictEqual(sourceOnce.firstCall.firstArg, 'error');
        });

        test('rejects when the injected source stream emits an error event', async function () {
            let sourceErrorListener = function (error: unknown): void {
                throw new Error(`expected the source error listener to be registered before piping: ${String(error)}`);
            };
            const extractStream = {
                once() {
                    return extractStream;
                },
                [Symbol.asyncIterator](): AsyncIterator<unknown> {
                    return {
                        async next(): Promise<IteratorResult<unknown>> {
                            return await new Promise<IteratorResult<unknown>>(keepPending);
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
                    queueMicrotask(function () {
                        sourceErrorListener(new Error('source boom'));
                    });
                    return gunzip;
                }
            };

            await expectFailure(async function () {
                await withPromiseDeadline(
                    extractTarEntries(Buffer.from('unused'), {
                        createSource() {
                            return source as unknown as Readable;
                        }
                    }),
                    'source stream error event'
                );
            }, /^Error: source boom$/u);
        });
    });
});

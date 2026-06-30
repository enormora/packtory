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

type TarExtractionLimits = {
    readonly maxEntryCount: number;
    readonly maxEntryPathLength: number;
    readonly maxExtractedBytes: number;
};

async function extractSingleFileWithLimits(
    limits: TarExtractionLimits
): Promise<Awaited<ReturnType<typeof extractTarEntries>>> {
    const builder = createTarballBuilder();
    const tar = await builder.build([ { filePath: 'file.txt', content: 'content', isExecutable: false } ]);
    return withPromiseDeadline(extractTarEntries(Buffer.from(tar), {}, limits), 'single-file limit tar extraction');
}

suite('extract-tar', function () {
    suite('entries', function () {
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

    suite('limits and stream failures', function () {
        test('rejects tarballs that exceed the entry count limit', async function () {
            const builder = createTarballBuilder();
            const tar = await builder.build([
                { filePath: 'first.txt', content: 'first', isExecutable: false },
                { filePath: 'second.txt', content: 'second', isExecutable: false }
            ]);

            await expectFailure(async function () {
                await withPromiseDeadline(
                    extractTarEntries(Buffer.from(tar), {}, {
                        maxEntryCount: 1,
                        maxEntryPathLength: 4096,
                        maxExtractedBytes: 1024
                    }),
                    'entry-count tar extraction'
                );
            }, /^Error: Refusing to extract tarball with more than 1 entries$/u);
        });

        test('rejects tar entries whose paths exceed the path length limit', async function () {
            const builder = createTarballBuilder();
            const tar = await builder.build([ { filePath: 'long-name.txt', content: 'content', isExecutable: false } ]);

            await expectFailure(async function () {
                await withPromiseDeadline(
                    extractTarEntries(Buffer.from(tar), {}, {
                        maxEntryCount: 10,
                        maxEntryPathLength: 4,
                        maxExtractedBytes: 1024
                    }),
                    'path-length tar extraction'
                );
            }, /^Error: Refusing to extract tarball entry with path longer than 4 characters$/u);
        });

        test('rejects tar entries whose paths exceed the default path length limit', async function () {
            const builder = createTarballBuilder();
            const tar = await builder.build([
                { filePath: `${'a'.repeat(4097)}.txt`, content: 'content', isExecutable: false }
            ]);

            await expectFailure(async function () {
                await withPromiseDeadline(
                    extractTarEntries(Buffer.from(tar)),
                    'default path-length tar extraction'
                );
            }, /^Error: Refusing to extract tarball entry with path longer than 4096 characters$/u);
        });

        test('rejects tarballs whose extracted content exceeds the size limit', async function () {
            const builder = createTarballBuilder();
            const tar = await builder.build([ { filePath: 'file.txt', content: 'content', isExecutable: false } ]);

            await expectFailure(async function () {
                await withPromiseDeadline(
                    extractTarEntries(Buffer.from(tar), {}, {
                        maxEntryCount: 10,
                        maxEntryPathLength: 4096,
                        maxExtractedBytes: 3
                    }),
                    'extracted-size tar extraction'
                );
            }, /^Error: Refusing to extract tarball larger than 3 bytes$/u);
        });

        suite('limit boundaries', function () {
            test('accepts tar entries whose paths are exactly at the path length limit', async function () {
                const entries = await extractSingleFileWithLimits({
                    maxEntryCount: 10,
                    maxEntryPathLength: 'file.txt'.length,
                    maxExtractedBytes: 1024
                });

                assert.strictEqual(entries[0]?.header.name, 'file.txt');
            });

            test('accepts tarballs whose extracted content is exactly at the size limit', async function () {
                const entries = await extractSingleFileWithLimits({
                    maxEntryCount: 10,
                    maxEntryPathLength: 4096,
                    maxExtractedBytes: 'content'.length
                });

                assert.strictEqual(entries[0]?.content, 'content');
            });
        });

        test('rejects when the given buffer is not a valid gzip tarball', async function () {
            await expectFailure(async function () {
                await withPromiseDeadline(extractTarEntries(Buffer.from('not-a-tarball')), 'invalid tar extraction');
            }, 'error');
        });
    });

    suite('injected stream failures', function () {
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
                throw new Error(
                    `expected the source error listener to be registered before piping: ${String(error)}`
                );
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

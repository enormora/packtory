import assert from 'node:assert';
import { suite, test } from 'mocha';
import sinon from 'sinon';
import { zip as fflateZip } from 'fflate';
import { extractZipEntries } from '../test-libraries/extract-zip.ts';
import { withPromiseDeadline } from '../test-libraries/promise-with-deadline.ts';
import { createZipBuilder } from './zip-builder.ts';

type ZipEntryOptions = {
    readonly os: number;
    readonly attrs: number;
    readonly mtime: number;
    readonly level: number;
};

type ZippableFileMap = Record<string, readonly [Uint8Array, ZipEntryOptions]>;
type ZipCallback = (error: unknown, data: unknown) => void;

const nonExecutableUnixMode = 0o10_0644;
const executableUnixMode = 0o10_0755;
const unixOperatingSystem = 3;
const staticFileModificationTimestamp = 315_576_000_000;
const maxCompressionLevel = 9;
const highBytesScale = 65_536;
const zipBuildDeadlineMilliseconds = 50;

function runFflateZip(data: ZippableFileMap, options: Record<string, never>, callback: ZipCallback): void {
    const zipValue: unknown = fflateZip;
    if (typeof zipValue !== 'function') {
        throw new TypeError('fflate zip export is not callable');
    }
    Reflect.apply(zipValue, undefined, [data, options, callback]);
}

async function buildZipWithDeadline(
    builder: ReturnType<typeof createZipBuilder>,
    fileDescriptions: Parameters<ReturnType<typeof createZipBuilder>['build']>[0],
    vendorEntries?: Parameters<ReturnType<typeof createZipBuilder>['build']>[1]
): Promise<Buffer> {
    return await withPromiseDeadline(
        builder.build(fileDescriptions, vendorEntries),
        'zip builder completion',
        zipBuildDeadlineMilliseconds
    );
}

suite('zip-builder', function () {
    test('creates an empty zip', async function () {
        const builder = createZipBuilder();
        const zipBuffer = await buildZipWithDeadline(builder, []);
        const entries = await extractZipEntries(zipBuffer);

        assert.deepStrictEqual(entries, []);
    });

    test('creates a zip with one file', async function () {
        const builder = createZipBuilder();

        const zipBuffer = await buildZipWithDeadline(builder, [
            { filePath: 'foo.txt', content: 'bar', isExecutable: false }
        ]);
        const entries = await extractZipEntries(zipBuffer);

        assert.deepStrictEqual(entries, [
            {
                name: 'foo.txt',
                content: 'bar',
                unixMode: nonExecutableUnixMode,
                osOfOrigin: unixOperatingSystem
            }
        ]);
    });

    test('marks executable files with the executable unix mode', async function () {
        const builder = createZipBuilder();

        const zipBuffer = await buildZipWithDeadline(builder, [
            { filePath: 'foo.txt', content: 'bar', isExecutable: true }
        ]);
        const entries = await extractZipEntries(zipBuffer);

        assert.deepStrictEqual(entries, [
            {
                name: 'foo.txt',
                content: 'bar',
                unixMode: executableUnixMode,
                osOfOrigin: unixOperatingSystem
            }
        ]);
    });

    test('creates a zip with many nested files', async function () {
        const builder = createZipBuilder();

        const zipBuffer = await buildZipWithDeadline(builder, [
            { filePath: 'root.md', content: 'root', isExecutable: false },
            { filePath: 'docs/intro.md', content: 'intro', isExecutable: false },
            { filePath: 'docs/api/index.md', content: 'index', isExecutable: false },
            { filePath: 'docs/api/v1/get.md', content: 'get', isExecutable: false }
        ]);
        const entries = await extractZipEntries(zipBuffer);

        assert.deepStrictEqual(entries, [
            { name: 'root.md', content: 'root', unixMode: nonExecutableUnixMode, osOfOrigin: unixOperatingSystem },
            {
                name: 'docs/intro.md',
                content: 'intro',
                unixMode: nonExecutableUnixMode,
                osOfOrigin: unixOperatingSystem
            },
            {
                name: 'docs/api/index.md',
                content: 'index',
                unixMode: nonExecutableUnixMode,
                osOfOrigin: unixOperatingSystem
            },
            {
                name: 'docs/api/v1/get.md',
                content: 'get',
                unixMode: nonExecutableUnixMode,
                osOfOrigin: unixOperatingSystem
            }
        ]);
    });

    test('passes the static modification time, unix os marker and maximum compression to fflate', async function () {
        const zip = sinon.spy((data: ZippableFileMap, options: Record<string, never>, callback: ZipCallback): void => {
            runFflateZip(data, options, callback);
        });
        const builder = createZipBuilder({ zip });

        await buildZipWithDeadline(builder, [{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);

        const [data, options] = zip.firstCall.args;
        assert.deepStrictEqual(data, {
            'foo.txt': [
                new TextEncoder().encode('bar'),
                {
                    os: unixOperatingSystem,
                    attrs: nonExecutableUnixMode * highBytesScale,
                    mtime: staticFileModificationTimestamp,
                    level: maxCompressionLevel
                }
            ]
        });
        assert.deepStrictEqual(options, {});
    });

    test('includes vendor entries with raw bytes from the file manager alongside inline file descriptions', async function () {
        const builder = createZipBuilder({
            fileManager: {
                getRealPath: async (filePath) => {
                    return filePath;
                },
                readFileBytes: async () => {
                    return Buffer.from('vendored-bytes', 'utf8');
                }
            }
        });

        const zipBuffer = await buildZipWithDeadline(
            builder,
            [{ filePath: 'index.js', content: 'console.log(0);', isExecutable: false }],
            [
                {
                    sourceAbsolutePath: '/repo/node_modules/pkg/dist/main.js',
                    sourcePackageRootPath: '/repo/node_modules/pkg',
                    targetRelativePath: 'node_modules/pkg/main.js',
                    isExecutable: false
                }
            ]
        );
        const entries = await extractZipEntries(zipBuffer);

        assert.deepStrictEqual(entries, [
            {
                name: 'index.js',
                content: 'console.log(0);',
                unixMode: nonExecutableUnixMode,
                osOfOrigin: unixOperatingSystem
            },
            {
                name: 'node_modules/pkg/main.js',
                content: 'vendored-bytes',
                unixMode: nonExecutableUnixMode,
                osOfOrigin: unixOperatingSystem
            }
        ]);
    });

    test('marks executable vendor entries with the executable unix mode in the zip output', async function () {
        const builder = createZipBuilder({
            fileManager: {
                getRealPath: async (filePath) => {
                    return filePath;
                },
                readFileBytes: async () => {
                    return Buffer.from('#!/bin/sh\necho hi', 'utf8');
                }
            }
        });

        const zipBuffer = await buildZipWithDeadline(
            builder,
            [],
            [
                {
                    sourceAbsolutePath: '/repo/node_modules/pkg/bin/run.sh',
                    sourcePackageRootPath: '/repo/node_modules/pkg',
                    targetRelativePath: 'node_modules/pkg/bin/run.sh',
                    isExecutable: true
                }
            ]
        );
        const entries = await extractZipEntries(zipBuffer);

        assert.deepStrictEqual(entries, [
            {
                name: 'node_modules/pkg/bin/run.sh',
                content: '#!/bin/sh\necho hi',
                unixMode: executableUnixMode,
                osOfOrigin: unixOperatingSystem
            }
        ]);
    });

    test('throws a clear error when vendor entries are requested without a configured file manager', async function () {
        const builder = createZipBuilder();
        try {
            await buildZipWithDeadline(
                builder,
                [],
                [
                    {
                        sourceAbsolutePath: '/anywhere',
                        sourcePackageRootPath: '/anywhere',
                        targetRelativePath: 'node_modules/pkg/index.js',
                        isExecutable: false
                    }
                ]
            );
            assert.fail('expected build() to reject because readFileBytes is not configured');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'readFileBytes is required to materialize vendor entries into the zip'
            );
        }
    });

    test('revalidates vendor source paths before reading zip bytes', async function () {
        const builder = createZipBuilder({
            fileManager: {
                getRealPath: async () => {
                    return '/repo/secret.js';
                },
                readFileBytes: async () => {
                    assert.fail('expected readFileBytes not to be called');
                }
            }
        });

        await assert.rejects(
            buildZipWithDeadline(
                builder,
                [],
                [
                    {
                        sourceAbsolutePath: '/repo/node_modules/pkg/index.js',
                        sourcePackageRootPath: '/repo/node_modules/pkg',
                        targetRelativePath: 'node_modules/pkg/index.js',
                        isExecutable: false
                    }
                ]
            ),
            {
                message:
                    'Vendored file "/repo/node_modules/pkg/index.js" resolved outside package root ' +
                    '"/repo/node_modules/pkg"'
            }
        );
    });

    test('rejects when fflate reports an error', async function () {
        const errorFromFflate = Object.assign(new Error('fflate-failure'), {
            code: 99
        });
        const failingZip = (_data: ZippableFileMap, _options: Record<string, never>, callback: ZipCallback): void => {
            queueMicrotask(() => {
                callback(errorFromFflate, new Uint8Array());
            });
        };
        const builder = createZipBuilder({ zip: failingZip });

        try {
            await buildZipWithDeadline(builder, [{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);
            assert.fail('Expected build() to reject but it did not');
        } catch (error: unknown) {
            assert.strictEqual(error, errorFromFflate);
        }
    });

    test('wraps non-Error zip failures into an Error', async function () {
        const nonErrorFailure: unknown = 'fflate-failure';
        const failingZip = (_data: ZippableFileMap, _options: Record<string, never>, callback: ZipCallback): void => {
            queueMicrotask(() => {
                callback(nonErrorFailure, new Uint8Array());
            });
        };
        const builder = createZipBuilder({ zip: failingZip });

        await assert.rejects(
            async () => buildZipWithDeadline(builder, [{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]),
            {
                message: '"fflate-failure"'
            }
        );
    });

    test('throws a clear error when the configured zip implementation is not callable', async function () {
        assert.throws(
            () =>
                createZipBuilder({
                    zip: 123 as unknown as (
                        data: ZippableFileMap,
                        options: Record<string, never>,
                        callback: ZipCallback
                    ) => void
                }),
            {
                name: 'TypeError',
                message: 'fflate zip export is not callable'
            }
        );
    });

    test('rejects when the zip implementation returns a non-binary payload', async function () {
        const invalidZip = (_data: ZippableFileMap, _options: Record<string, never>, callback: ZipCallback): void => {
            queueMicrotask(() => {
                callback(undefined, 'not-bytes');
            });
        };
        const builder = createZipBuilder({ zip: invalidZip });

        await assert.rejects(
            async () => buildZipWithDeadline(builder, [{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]),
            {
                message: 'fflate zip returned a non-binary payload'
            }
        );
    });
});

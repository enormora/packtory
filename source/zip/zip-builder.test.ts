import assert from 'node:assert';
import { suite, test } from 'mocha';
import sinon from 'sinon';
import {
    zip as fflateZip,
    type AsyncZippable,
    type AsyncZipOptions,
    type FlateCallback,
    type FlateError
} from 'fflate';
import { extractZipEntries } from '../test-libraries/extract-zip.ts';
import { createZipBuilder } from './zip-builder.ts';

const nonExecutableUnixMode = 0o10_0644;
const executableUnixMode = 0o10_0755;
const unixOperatingSystem = 3;
const staticFileModificationTime = new Date(Date.UTC(1980, 0, 1, 12, 0, 0));
const maxCompressionLevel = 9;
const highBytesScale = 65_536;

suite('zip-builder', function () {
    test('creates an empty zip', async function () {
        const builder = createZipBuilder();
        const zipBuffer = await builder.build([]);
        const entries = await extractZipEntries(zipBuffer);

        assert.deepStrictEqual(entries, []);
    });

    test('creates a zip with one file', async function () {
        const builder = createZipBuilder();

        const zipBuffer = await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);
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

        const zipBuffer = await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: true }]);
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

        const zipBuffer = await builder.build([
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
        const zip = sinon.spy((data: AsyncZippable, options: AsyncZipOptions, callback: FlateCallback): void => {
            fflateZip(data, options, callback);
        });
        const builder = createZipBuilder({ zip });

        await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);

        const [data, options] = zip.firstCall.args;
        assert.deepStrictEqual(data, {
            'foo.txt': [
                new TextEncoder().encode('bar'),
                {
                    os: unixOperatingSystem,
                    attrs: nonExecutableUnixMode * highBytesScale,
                    mtime: staticFileModificationTime,
                    level: maxCompressionLevel
                }
            ]
        });
        assert.deepStrictEqual(options, {});
    });

    test('rejects when fflate reports an error', async function () {
        const errorFromFflate: FlateError = Object.assign(new Error('fflate-failure'), {
            code: 99 as FlateError['code']
        });
        const failingZip = (_data: AsyncZippable, _options: AsyncZipOptions, callback: FlateCallback): void => {
            queueMicrotask(() => {
                callback(errorFromFflate, new Uint8Array());
            });
        };
        const builder = createZipBuilder({ zip: failingZip });

        try {
            await builder.build([{ filePath: 'foo.txt', content: 'bar', isExecutable: false }]);
            assert.fail('Expected build() to reject but it did not');
        } catch (error: unknown) {
            assert.strictEqual(error, errorFromFflate);
        }
    });
});

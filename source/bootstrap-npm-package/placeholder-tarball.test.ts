import assert from 'node:assert';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { suite, test } from 'mocha';
import tar from 'tar-stream';
import { createPlaceholderTarballBuilder, type PlaceholderTarballBuilder } from './placeholder-tarball.ts';

type PlaceholderTarballInput = Parameters<PlaceholderTarballBuilder['build']>[0];

type ExtractedEntry = {
    readonly name: string;
    readonly content: string;
    readonly mode: number;
};

async function extractTarball(tarball: Buffer): Promise<readonly ExtractedEntry[]> {
    const extracted: ExtractedEntry[] = [];
    const extract = tar.extract();
    const gunzip = zlib.createGunzip();
    const collection = new Promise<readonly ExtractedEntry[]>((resolve, reject) => {
        extract.on('entry', (header, stream, next) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => {
                chunks.push(Buffer.from(chunk));
            });
            stream.on('end', () => {
                extracted.push({
                    name: header.name,
                    content: Buffer.concat(chunks).toString('utf8'),
                    mode: header.mode ?? 0
                });
                next();
            });
            stream.on('error', reject);
            stream.resume();
        });
        extract.on('finish', () => {
            resolve(extracted);
        });
        extract.on('error', reject);
    });
    Readable.from(tarball).pipe(gunzip).pipe(extract);
    return collection;
}

function buildInput(overrides: Partial<PlaceholderTarballInput> = {}): PlaceholderTarballInput {
    return {
        manifest: {
            name: '@scope/example',
            version: '0.0.1',
            description: 'Placeholder claiming the package name',
            license: 'MIT',
            deprecated: 'placeholder'
        },
        readmeContent: '# Placeholder\n',
        ...overrides
    };
}

suite('placeholder-tarball', function () {
    test('emits a gzipped tarball with the package.json and readme.md under the package/ prefix', async function () {
        const builder = createPlaceholderTarballBuilder({ createGzip: zlib.createGzip, createPack: tar.pack });

        const tarball = await builder.build(buildInput());
        const entries = await extractTarball(tarball);

        const entryNames = entries.map((entry) => {
            return entry.name;
        });
        assert.deepStrictEqual(entryNames, ['package/package.json', 'package/readme.md']);
    });

    test('serializes the manifest as JSON with a trailing newline', async function () {
        const builder = createPlaceholderTarballBuilder({ createGzip: zlib.createGzip, createPack: tar.pack });

        const tarball = await builder.build(
            buildInput({
                manifest: {
                    name: '@scope/example',
                    version: '0.0.1',
                    description: 'placeholder',
                    license: 'MIT',
                    deprecated: 'placeholder claim'
                }
            })
        );
        const entries = await extractTarball(tarball);
        const manifestEntry = entries.find((entry) => {
            return entry.name === 'package/package.json';
        });

        assert.ok(manifestEntry !== undefined, 'expected manifest entry');
        assert.strictEqual(manifestEntry.content.endsWith('\n'), true);
        assert.deepStrictEqual(JSON.parse(manifestEntry.content), {
            name: '@scope/example',
            version: '0.0.1',
            description: 'placeholder',
            license: 'MIT',
            deprecated: 'placeholder claim'
        });
    });

    test('stores the readme content verbatim', async function () {
        const builder = createPlaceholderTarballBuilder({ createGzip: zlib.createGzip, createPack: tar.pack });
        const readmeContent = '# Title\n\nBody text.\n';

        const tarball = await builder.build(buildInput({ readmeContent }));
        const entries = await extractTarball(tarball);
        const readmeEntry = entries.find((entry) => {
            return entry.name === 'package/readme.md';
        });

        assert.ok(readmeEntry !== undefined, 'expected readme entry');
        assert.strictEqual(readmeEntry.content, readmeContent);
    });

    test('normalizes the gzip header operating-system byte to "unknown" for reproducible output', async function () {
        const builder = createPlaceholderTarballBuilder({ createGzip: zlib.createGzip, createPack: tar.pack });

        const tarball = await builder.build(buildInput());
        const gzipOperatingSystemByteIndex = 9;
        const unknownOperatingSystemFlag = 255;

        assert.strictEqual(tarball[gzipOperatingSystemByteIndex], unknownOperatingSystemFlag);
    });
});

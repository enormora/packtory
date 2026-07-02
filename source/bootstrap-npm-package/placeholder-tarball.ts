import type zlib from 'node:zlib';
import type tar from 'tar-stream';

type PlaceholderManifest = {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly license: string;
    readonly deprecated: string;
};

type PlaceholderTarballInput = {
    readonly manifest: PlaceholderManifest;
    readonly readmeContent: string;
};

export type PlaceholderTarballBuilderDependencies = {
    readonly createGzip: typeof zlib.createGzip;
    readonly createPack: typeof tar.pack;
};

export type PlaceholderTarballBuilder = {
    readonly build: (input: PlaceholderTarballInput) => Promise<Buffer>;
};

const staticFileModificationTimeEpochMilliseconds = 0;
const regularFileMode = 420;
const gzipHeaderOperatingSystemFieldIndex = 9;
const gzipHeaderOperatingSystemUnknown = 255;
const manifestJsonIndent = 2;

function normalizeGzipHeader(data: Buffer): Buffer {
    const normalized = Buffer.from(data);
    normalized[gzipHeaderOperatingSystemFieldIndex] = gzipHeaderOperatingSystemUnknown;
    return normalized;
}

function serializeManifest(manifest: PlaceholderManifest): string {
    return `${JSON.stringify(manifest, null, manifestJsonIndent)}\n`;
}

function appendFile(pack: Readonly<tar.Pack>, name: string, content: string): void {
    pack.entry(
        {
            name,
            size: Buffer.byteLength(content),
            mtime: new Date(staticFileModificationTimeEpochMilliseconds),
            mode: regularFileMode
        },
        content
    );
}

function toBuffer(chunk: Buffer | string): Buffer {
    return Buffer.from(chunk);
}

async function collectGzippedTarball(pack: Readonly<tar.Pack>, createGzip: typeof zlib.createGzip): Promise<Buffer> {
    const tarballStream = pack.pipe(createGzip());
    const chunks: Buffer[] = [];
    for await (const chunk of tarballStream as AsyncIterable<unknown>) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- gzip stream yields buffers in this usage
        chunks.push(toBuffer(chunk as Buffer | string));
    }
    return normalizeGzipHeader(Buffer.concat(chunks));
}

export function createPlaceholderTarballBuilder(
    dependencies: Readonly<PlaceholderTarballBuilderDependencies>
): PlaceholderTarballBuilder {
    const { createGzip, createPack } = dependencies;

    return {
        async build(input) {
            const pack = createPack();
            const result = collectGzippedTarball(pack, createGzip);
            appendFile(pack, 'package/package.json', serializeManifest(input.manifest));
            appendFile(pack, 'package/readme.md', input.readmeContent);
            pack.finalize();
            return result;
        }
    };
}

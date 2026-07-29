import type zlib from 'node:zlib';
import type tar from 'tar-stream';

const gzipHeaderOperatingSystemFieldIndex = 9;
const gzipHeaderOperatingSystemUnknown = 255;

function normalizePlaceholderGzipHeader(data: Buffer): Buffer {
    const normalized = Buffer.from(data);
    normalized[gzipHeaderOperatingSystemFieldIndex] = gzipHeaderOperatingSystemUnknown;
    return normalized;
}

function placeholderGzipStreamChunkToBuffer(chunk: unknown): Buffer {
    if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
        return Buffer.from(chunk);
    }
    throw new TypeError('Expected placeholder gzip stream to yield Buffer, Uint8Array, or string chunks');
}

export async function collectPlaceholderGzipPack(
    pack: Readonly<tar.Pack>,
    gzip: ReturnType<typeof zlib.createGzip>
): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of pack.pipe(gzip)) {
        chunks.push(placeholderGzipStreamChunkToBuffer(chunk));
    }
    return normalizePlaceholderGzipHeader(Buffer.concat(chunks));
}

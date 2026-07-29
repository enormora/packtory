import type zlib from 'node:zlib';
import type tar from 'tar-stream';

const gzipHeaderOperatingSystemFieldIndex = 9;
const gzipHeaderOperatingSystemUnknown = 255;

function normalizeGzipHeader(data: Buffer): Buffer {
    const normalized = Buffer.from(data);
    normalized[gzipHeaderOperatingSystemFieldIndex] = gzipHeaderOperatingSystemUnknown;
    return normalized;
}

function gzipStreamChunkToBuffer(chunk: unknown): Buffer {
    if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
        return Buffer.from(chunk);
    }
    throw new TypeError('Expected gzip stream to yield Buffer, Uint8Array, or string chunks');
}

export async function collectGzippedPack(
    pack: Readonly<tar.Pack>,
    gzip: ReturnType<typeof zlib.createGzip>
): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of pack.pipe(gzip)) {
        chunks.push(gzipStreamChunkToBuffer(chunk));
    }
    return normalizeGzipHeader(Buffer.concat(chunks));
}

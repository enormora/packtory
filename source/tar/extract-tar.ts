import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { extract, type Headers as TarEntryHeaders } from 'tar-stream';

export type TarEntry = {
    readonly header: TarEntryHeaders;
    readonly content: string;
};

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

type TarStreamEntry = AsyncIterable<Buffer> & {
    readonly header: TarEntryHeaders;
};

type ErrorEmitter = {
    readonly once: (eventName: 'error', listener: (error: unknown) => void) => unknown;
};

async function collectTarEntries(stream: AsyncIterable<TarStreamEntry>): Promise<TarEntry[]> {
    const entries: TarEntry[] = [];

    for await (const entry of stream) {
        let result = '';
        for await (const chunk of entry) {
            result += chunk.toString();
        }
        entries.push({ header: entry.header, content: result });
    }

    return entries;
}

async function waitForStreamError(stream: ErrorEmitter): Promise<never> {
    return await new Promise<never>((_resolve, reject) => {
        stream.once('error', (error: unknown) => {
            reject(toError(error));
        });
    });
}

export async function extractTarEntries(buffer: Buffer): Promise<TarEntry[]> {
    const extractStream = extract();
    const source = Readable.from(buffer);
    const gunzip = createGunzip();
    const stream = source.pipe(gunzip).pipe(extractStream) as AsyncIterable<TarStreamEntry>;

    try {
        return await Promise.race([
            collectTarEntries(stream),
            waitForStreamError(source),
            waitForStreamError(gunzip),
            waitForStreamError(extractStream)
        ]);
    } catch (error: unknown) {
        throw toError(error);
    }
}

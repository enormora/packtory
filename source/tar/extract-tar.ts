import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { extract, type Headers as TarEntryHeaders } from 'tar-stream';

export type TarEntry = {
    readonly header: TarEntryHeaders;
    readonly content: string;
};

export async function extractTarEntries(buffer: Buffer): Promise<TarEntry[]> {
    const extractStream = extract();
    const stream = Readable.from(buffer).pipe(createGunzip()).pipe(extractStream);
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

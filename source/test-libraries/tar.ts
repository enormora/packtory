import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { extract } from 'tar-stream';

type Entry = {
    readonly header: unknown;
    readonly content: string;
};

export async function extractTarEntries(buffer: Buffer): Promise<Entry[]> {
    const extractStream = extract();
    const stream = Readable.from(buffer).pipe(createGunzip()).pipe(extractStream);
    const entries: Entry[] = [];

    for await (const entry of stream) {
        let result = '';
        for await (const chunk of entry) {
            result += chunk.toString();
        }
        entries.push({ header: entry.header, content: result });
    }

    return entries;
}

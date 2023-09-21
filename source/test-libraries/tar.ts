import {extract} from 'tar-stream';
import {createGunzip} from 'zlib';
import {Readable} from 'node:stream';

interface Entry {
    header: unknown;
    content: string;
}

export async function extractTarEntries(buffer: Buffer): Promise<Entry[]> {
    const extractStream = extract();
    const stream = Readable.from(buffer).pipe(createGunzip()).pipe(extractStream);
    const entries: Entry[] = [];

    for await (const entry of stream) {
        let result = '';
        for await (const chunk of entry) {
            result += chunk;
        }
        entries.push({header: entry.header, content: result});
    }

    return entries;
}

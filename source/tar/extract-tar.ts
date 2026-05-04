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

export async function extractTarEntries(buffer: Buffer): Promise<TarEntry[]> {
    const extractStream = extract();
    const source = Readable.from(buffer);
    const gunzip = createGunzip();
    const stream = source.pipe(gunzip).pipe(extractStream);
    const errorEventName = 'error';

    return new Promise<TarEntry[]>((resolve, reject) => {
        const rejectOnError = (error: Error): void => {
            reject(error);
        };

        source.once(errorEventName, rejectOnError);
        gunzip.once(errorEventName, rejectOnError);
        extractStream.once(errorEventName, rejectOnError);

        // eslint-disable-next-line no-void -- The async reader resolves via resolve/reject above.
        void (async (): Promise<void> => {
            try {
                const entries: TarEntry[] = [];

                for await (const entry of stream) {
                    let result = '';
                    for await (const chunk of entry) {
                        result += chunk.toString();
                    }
                    entries.push({ header: entry.header, content: result });
                }

                resolve(entries);
            } catch (error: unknown) {
                reject(toError(error));
            }
        })();
    });
}

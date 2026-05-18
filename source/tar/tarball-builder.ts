import zlib from 'node:zlib';
import tar, { type Pack } from 'tar-stream';
import type { FileDescription } from '../file-manager/file-description.ts';

export type TarballBuilder = {
    build: (fileDescriptions: readonly FileDescription[]) => Promise<Buffer>;
};

type TarballBuilderDependencies = {
    readonly createGzip: typeof zlib.createGzip;
};

const gzipHeaderOperationSystemTypeFieldIndex = 9;
const gzipHeaderOperationSystemTypeUnknown = 255;

function normalizeGzipHeader(data: Buffer): Buffer {
    const normalizedData = Buffer.from(data);
    normalizedData[gzipHeaderOperationSystemTypeFieldIndex] = gzipHeaderOperationSystemTypeUnknown;
    return normalizedData;
}

function toBuffer(chunk: Buffer | string): Buffer {
    return Buffer.from(chunk);
}

const staticFileModificationTime = new Date(0);
const executableFileMode = 493;
const nonExecutableFileMode = 420;

export function createTarballBuilder(dependencies: Partial<TarballBuilderDependencies> = {}): TarballBuilder {
    const createGzip = dependencies.createGzip ?? zlib.createGzip;

    function createPack(fileDescriptions: readonly FileDescription[]): Pack {
        const pack = tar.pack();

        for (const fileDescription of fileDescriptions) {
            const entry = pack.entry(
                {
                    name: fileDescription.filePath,
                    mtime: staticFileModificationTime,
                    mode: fileDescription.isExecutable ? executableFileMode : nonExecutableFileMode
                },
                fileDescription.content
            );
            entry.end();
        }

        pack.finalize();

        return pack;
    }

    return {
        async build(fileDescriptions) {
            const pack = createPack(fileDescriptions);

            const gzipStream = createGzip({ level: 9 });
            const tarballStream = pack.pipe(gzipStream);
            const chunks: Buffer[] = [];

            for await (const chunk of tarballStream as AsyncIterable<unknown>) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- gzip stream yields buffers in this usage
                chunks.push(toBuffer(chunk as Buffer | string));
            }

            const tarData = Buffer.concat(chunks);
            return normalizeGzipHeader(tarData);
        }
    };
}

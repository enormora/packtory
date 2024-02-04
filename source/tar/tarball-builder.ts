import zlib from 'node:zlib';
import tar, { type Pack } from 'tar-stream';
import type { FileDescription } from '../file-description/file-description.js';

export type TarballBuilder = {
    build(fileDescriptions: readonly FileDescription[]): Promise<Buffer>;
};

const gzipHeaderOperationSystemTypeFieldIndex = 9;
const gzipHeaderOperationSystemTypeUnknown = 255;

function unsetOperatingSystemGzipHeaderField(data: Buffer): void {
    // eslint-disable-next-line no-param-reassign -- copying the whole buffer would be really inefficient
    data[gzipHeaderOperationSystemTypeFieldIndex] = gzipHeaderOperationSystemTypeUnknown;
}

const staticFileModificationTime = new Date(0);
const executableFileMode = 493;
const nonExecutableFileMode = 420;

export function createTarballBuilder(): TarballBuilder {
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

            const gzipStream = zlib.createGzip({ level: 9 });
            const tarballStream = pack.pipe(gzipStream);
            const chunks: Buffer[] = [];

            for await (const chunk of tarballStream) {
                chunks.push(chunk as Buffer);
            }

            const tarData = Buffer.concat(chunks);
            unsetOperatingSystemGzipHeaderField(tarData);
            return tarData;
        }
    };
}

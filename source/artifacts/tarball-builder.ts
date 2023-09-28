import zlib from 'node:zlib';
import tar from 'tar-stream';

export type TarballBuilder = {
    addFile(filePath: string, content: string): void;
    build(): Promise<Buffer>;
};

const gzipHeaderOperationSystemTypeFieldIndex = 9;
const gzipHeaderOperationSystemTypeUnknown = 255;

function unsetOperatingSystemGzipHeaderField(data: Buffer): void {
    // eslint-disable-next-line no-param-reassign -- copying the whole buffer would be really inefficient
    data[gzipHeaderOperationSystemTypeFieldIndex] = gzipHeaderOperationSystemTypeUnknown;
}

export function createTarballBuilder(): TarballBuilder {
    const pack = tar.pack();

    return {
        addFile(filePath, content) {
            const entry = pack.entry({ name: filePath, mtime: new Date(0) }, content);
            entry.end();
        },

        async build() {
            pack.finalize();

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

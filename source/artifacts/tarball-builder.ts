import tar from 'tar-stream';
import zlib from 'node:zlib';

export interface TarballBuilder {
    addFile(filePath: string, content: string): void;
    build(): Promise<Buffer>;
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
                chunks.push(chunk);
            }

            return Buffer.concat(chunks);
        },
    };
}

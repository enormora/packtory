import zlib from 'node:zlib';
import tar, { type Pack } from 'tar-stream';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { VendorEntry } from '../vendor-materializer/vendor-entry.ts';

export type TarballBuilder = {
    build: (fileDescriptions: readonly FileDescription[], vendorEntries?: readonly VendorEntry[]) => Promise<Buffer>;
};

type TarballBuilderDependencies = {
    readonly createGzip: typeof zlib.createGzip;
    readonly fileManager: Pick<FileManager, 'readFileBytes'>;
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
    const fileManager = dependencies.fileManager ?? {
        async readFileBytes(): Promise<Buffer> {
            throw new Error('readFileBytes is required to materialize vendor entries into the tarball');
        }
    };

    function addEntry(pack: Pack, filePath: string, isExecutable: boolean, payload: Buffer | string): void {
        const entry = pack.entry(
            {
                name: filePath,
                mtime: staticFileModificationTime,
                mode: isExecutable ? executableFileMode : nonExecutableFileMode
            },
            payload
        );
        entry.end();
    }

    async function createPack(
        fileDescriptions: readonly FileDescription[],
        vendorEntries: readonly VendorEntry[]
    ): Promise<Pack> {
        const pack = tar.pack();

        for (const fileDescription of fileDescriptions) {
            addEntry(pack, fileDescription.filePath, fileDescription.isExecutable, fileDescription.content);
        }
        for (const vendorEntry of vendorEntries) {
            const payload = await fileManager.readFileBytes(vendorEntry.sourceAbsolutePath);
            addEntry(pack, vendorEntry.targetRelativePath, vendorEntry.isExecutable, payload);
        }

        pack.finalize();

        return pack;
    }

    return {
        async build(fileDescriptions, vendorEntries = []) {
            const pack = await createPack(fileDescriptions, vendorEntries);

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

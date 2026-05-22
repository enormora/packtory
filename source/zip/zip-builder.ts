import { promisify } from 'node:util';
import { zip as fflateZip, type AsyncZippable, type AsyncZipOptions, type FlateCallback } from 'fflate';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { VendorEntry } from '../vendor-materializer/vendor-entry.ts';

type AsyncZipFunction = (data: AsyncZippable, options: AsyncZipOptions, callback: FlateCallback) => void;
type PromisifiedZip = (data: AsyncZippable, options: AsyncZipOptions) => Promise<Uint8Array>;

export type ZipBuilder = {
    build: (fileDescriptions: readonly FileDescription[], vendorEntries?: readonly VendorEntry[]) => Promise<Buffer>;
};

type ZipBuilderDependencies = {
    readonly zip?: AsyncZipFunction;
    readonly fileManager?: Pick<FileManager, 'readFileBytes'>;
};

const unixOperatingSystem = 3;
const executableUnixMode = 0o10_0755;
const nonExecutableUnixMode = 0o10_0644;
const highBytesScale = 65_536;
const maxCompressionLevel = 9;
// 1980-01-01T12:00:00Z. Zip's DOS time format requires year >= 1980; the noon offset keeps
// `getFullYear()` at 1980 across all timezones. Kept as a plain literal so the module has no
// load-time side effects (tree-shake-friendly).
const staticFileModificationTimestamp = 315_576_000_000;

function externalAttributes(isExecutable: boolean): number {
    return (isExecutable ? executableUnixMode : nonExecutableUnixMode) * highBytesScale;
}

function buildFileEntry(payload: Uint8Array, isExecutable: boolean): [Uint8Array, AsyncZipOptions] {
    return [
        payload,
        {
            os: unixOperatingSystem,
            attrs: externalAttributes(isExecutable),
            mtime: staticFileModificationTimestamp,
            level: maxCompressionLevel
        }
    ];
}

async function toFileMap(
    fileDescriptions: readonly FileDescription[],
    vendorEntries: readonly VendorEntry[],
    readFileBytes: (filePath: string) => Promise<Buffer>
): Promise<AsyncZippable> {
    const fileMap: AsyncZippable = {};
    for (const fileDescription of fileDescriptions) {
        fileMap[fileDescription.filePath] = buildFileEntry(
            new TextEncoder().encode(fileDescription.content),
            fileDescription.isExecutable
        );
    }
    for (const vendorEntry of vendorEntries) {
        const payload = await readFileBytes(vendorEntry.sourceAbsolutePath);
        fileMap[vendorEntry.targetRelativePath] = buildFileEntry(payload, vendorEntry.isExecutable);
    }
    return fileMap;
}

export function createZipBuilder(dependencies: ZipBuilderDependencies = {}): ZipBuilder {
    const fileManager = dependencies.fileManager ?? {
        async readFileBytes(): Promise<Buffer> {
            throw new Error('readFileBytes is required to materialize vendor entries into the zip');
        }
    };
    const zip = dependencies.zip ?? fflateZip;
    const runZip: PromisifiedZip = promisify(zip);

    return {
        async build(fileDescriptions, vendorEntries = []) {
            const fileMap = await toFileMap(fileDescriptions, vendorEntries, async (filePath) => {
                return fileManager.readFileBytes(filePath);
            });
            const data = await runZip(fileMap, {});
            return Buffer.from(data);
        }
    };
}

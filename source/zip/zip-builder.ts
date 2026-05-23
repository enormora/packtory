import { zip as fflateZip } from 'fflate';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { VendorEntry } from '../vendor-materializer/vendor-entry.ts';

type ZipEntryOptions = {
    readonly os: number;
    readonly attrs: number;
    readonly mtime: number;
    readonly level: number;
};

type ZippableFileMap = Record<string, readonly [Uint8Array, ZipEntryOptions]>;
type ZipCallback = (error: unknown, data: unknown) => void;
type AsyncZipFunction = (data: ZippableFileMap, options: Record<string, never>, callback: ZipCallback) => void;

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

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(JSON.stringify(error));
}

function isUint8Array(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array;
}

function createZipFunction(zip: AsyncZipFunction | undefined): AsyncZipFunction {
    const zipValue: unknown = zip ?? fflateZip;
    if (typeof zipValue !== 'function') {
        throw new TypeError('fflate zip export is not callable');
    }

    return (data, options, callback) => {
        Reflect.apply(zipValue, undefined, [data, options, callback]);
    };
}

function buildFileEntry(payload: Uint8Array, isExecutable: boolean): [Uint8Array, ZipEntryOptions] {
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
): Promise<ZippableFileMap> {
    const fileMap: ZippableFileMap = {};
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
    const zip = createZipFunction(dependencies.zip);

    return {
        async build(fileDescriptions, vendorEntries = []) {
            const fileMap = await toFileMap(fileDescriptions, vendorEntries, async (filePath) => {
                return fileManager.readFileBytes(filePath);
            });
            const data = await new Promise<Uint8Array>((resolve, reject) => {
                zip(fileMap, {}, (error, zippedData) => {
                    if (error === null || error === undefined) {
                        if (!isUint8Array(zippedData)) {
                            reject(new Error('fflate zip returned a non-binary payload'));
                            return;
                        }
                        resolve(zippedData);
                        return;
                    }
                    reject(asError(error));
                });
            });
            return Buffer.from(data);
        }
    };
}

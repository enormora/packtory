import { zip as fflateZip } from 'fflate';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import { validateVendorEntrySource, type VendorEntry } from '../vendor-materializer/vendor-entry.ts';

type ZipEntryOptions = {
    readonly os: number;
    readonly attrs: number;
    readonly mtime: number;
    readonly level: number;
};

type ZippableFileMap = Readonly<Record<string, readonly [Uint8Array, ZipEntryOptions]>>;
type ZipCallback = (error: unknown, data: unknown) => void;
type AsyncZipFunction = (
    data: ZippableFileMap,
    options: Readonly<Record<string, never>>,
    callback: ZipCallback
) => void;

export type ZipBuilder = {
    build: (fileDescriptions: readonly FileDescription[], vendorEntries?: readonly VendorEntry[]) => Promise<Buffer>;
};

type ZipBuilderDependencies = {
    readonly zip?: AsyncZipFunction;
    readonly fileManager?: Pick<FileManager, 'getRealPath' | 'readFileBytes'>;
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

    return function (data, options, callback) {
        Reflect.apply(zipValue, undefined, [ data, options, callback ]);
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
    fileManager: Pick<FileManager, 'getRealPath' | 'readFileBytes'>
): Promise<ZippableFileMap> {
    const fileMap: Record<string, readonly [Uint8Array, ZipEntryOptions]> = {};
    const textEncoder = new TextEncoder();
    for (const fileDescription of fileDescriptions) {
        const encodedContent = textEncoder.encode(fileDescription.content);
        fileMap[fileDescription.filePath] = buildFileEntry(
            encodedContent,
            fileDescription.isExecutable
        );
    }
    for (const vendorEntry of vendorEntries) {
        await validateVendorEntrySource(fileManager, vendorEntry);
        const payload = await fileManager.readFileBytes(vendorEntry.sourceAbsolutePath);
        fileMap[vendorEntry.targetRelativePath] = buildFileEntry(payload, vendorEntry.isExecutable);
    }
    return fileMap;
}

export function createZipBuilder(dependencies: ZipBuilderDependencies = {}): ZipBuilder {
    const fileManager = dependencies.fileManager ?? {
        async getRealPath(filePath: string): Promise<string> {
            return filePath;
        },
        async readFileBytes(): Promise<Buffer> {
            throw new Error('readFileBytes is required to materialize vendor entries into the zip');
        }
    };
    const zip = createZipFunction(dependencies.zip);

    return {
        async build(fileDescriptions, vendorEntries = []) {
            const fileMap = await toFileMap(fileDescriptions, vendorEntries, fileManager);
            const data = await new Promise<Uint8Array>(function (resolve, reject) {
                zip(fileMap, {}, function (error, zippedData) {
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

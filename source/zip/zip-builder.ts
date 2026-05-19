import { promisify } from 'node:util';
import { zip as fflateZip, type AsyncZippable, type AsyncZipOptions, type FlateCallback } from 'fflate';
import type { FileDescription } from '../file-manager/file-description.ts';

type AsyncZipFunction = (data: AsyncZippable, options: AsyncZipOptions, callback: FlateCallback) => void;
type PromisifiedZip = (data: AsyncZippable, options: AsyncZipOptions) => Promise<Uint8Array>;

export type ZipBuilder = {
    build: (fileDescriptions: readonly FileDescription[]) => Promise<Buffer>;
};

type ZipBuilderDependencies = {
    readonly zip: AsyncZipFunction;
};

const unixOperatingSystem = 3;
const regularFileMarker = 0o10_0000;
const executablePermissionBits = 0o755;
const nonExecutablePermissionBits = 0o644;
const executableUnixMode = regularFileMarker + executablePermissionBits;
const nonExecutableUnixMode = regularFileMarker + nonExecutablePermissionBits;
const highBytesScale = 65_536;
const maxCompressionLevel = 9;
const minimumDosYear = 1980;
const safeUtcHour = 12;
const staticFileModificationTime = new Date(Date.UTC(minimumDosYear, 0, 1, safeUtcHour, 0, 0));

function externalAttributes(isExecutable: boolean): number {
    return (isExecutable ? executableUnixMode : nonExecutableUnixMode) * highBytesScale;
}

function buildFileEntry(fileDescription: FileDescription): [Uint8Array, AsyncZipOptions] {
    return [
        new TextEncoder().encode(fileDescription.content),
        {
            os: unixOperatingSystem,
            attrs: externalAttributes(fileDescription.isExecutable),
            mtime: staticFileModificationTime,
            level: maxCompressionLevel
        }
    ];
}

function toFileMap(fileDescriptions: readonly FileDescription[]): AsyncZippable {
    const fileMap: AsyncZippable = {};
    for (const fileDescription of fileDescriptions) {
        fileMap[fileDescription.filePath] = buildFileEntry(fileDescription);
    }
    return fileMap;
}

export function createZipBuilder(dependencies: Partial<ZipBuilderDependencies> = {}): ZipBuilder {
    const zip = dependencies.zip ?? fflateZip;
    const runZip: PromisifiedZip = promisify(zip);

    return {
        async build(fileDescriptions) {
            const data = await runZip(toFileMap(fileDescriptions), {});
            return Buffer.from(data);
        }
    };
}

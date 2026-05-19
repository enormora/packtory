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

function buildFileEntry(fileDescription: FileDescription): [Uint8Array, AsyncZipOptions] {
    return [
        new TextEncoder().encode(fileDescription.content),
        {
            os: unixOperatingSystem,
            attrs: externalAttributes(fileDescription.isExecutable),
            mtime: staticFileModificationTimestamp,
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

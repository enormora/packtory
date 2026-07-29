import type zlib from 'node:zlib';
import type tar from 'tar-stream';
import { collectPlaceholderGzipPack } from './placeholder-gzip.ts';

type PlaceholderManifest = {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly license: string;
    readonly deprecated: string;
};

type PlaceholderTarballInput = {
    readonly manifest: PlaceholderManifest;
    readonly readmeContent: string;
};

export type PlaceholderTarballBuilderDependencies = {
    readonly createGzip: typeof zlib.createGzip;
    readonly createPack: typeof tar.pack;
};

export type PlaceholderTarballBuilder = {
    readonly build: (input: PlaceholderTarballInput) => Promise<Buffer>;
};

const staticFileModificationTimeEpochMilliseconds = 0;
const regularFileMode = 420;
const manifestJsonIndent = 2;

function serializeManifest(manifest: PlaceholderManifest): string {
    return `${JSON.stringify(manifest, null, manifestJsonIndent)}\n`;
}

function appendFile(pack: Readonly<tar.Pack>, name: string, content: string): void {
    pack.entry(
        {
            name,
            size: Buffer.byteLength(content),
            mtime: new Date(staticFileModificationTimeEpochMilliseconds),
            mode: regularFileMode
        },
        content
    );
}

export function createPlaceholderTarballBuilder(
    dependencies: Readonly<PlaceholderTarballBuilderDependencies>
): PlaceholderTarballBuilder {
    const { createGzip, createPack } = dependencies;

    return {
        async build(input) {
            const pack = createPack();
            const result = collectPlaceholderGzipPack(pack, createGzip());
            appendFile(pack, 'package/package.json', serializeManifest(input.manifest));
            appendFile(pack, 'package/readme.md', input.readmeContent);
            pack.finalize();
            return result;
        }
    };
}

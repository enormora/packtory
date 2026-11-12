import assert from 'node:assert/strict';
import path from 'node:path';
import { unzipSync as unzip } from 'fflate';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import { extractTarEntries } from '../source/tar/extract-tar.ts';
import type { PackFormat } from '../source/pack-emitter/pack-emitter.ts';

export type PipelineArtifact = {
    readonly projectFolder: string;
    readonly outputPath: string;
    readonly format: PackFormat;
    readonly vendorFiles: ReadonlyMap<string, Buffer>;
};
const maximumArchiveEntries = 10_000;
const maximumArchivePathLength = 4096;
const maximumArchiveBytes = 67_108_864;

async function verifyFolder(fileManager: FileManager, artifact: PipelineArtifact): Promise<void> {
    const manifest = await fileManager.readFile(path.join(artifact.outputPath, 'package.json'));
    assert.ok(manifest.includes('performance-package-'));
    for (const [ sourcePath, content ] of artifact.vendorFiles) {
        const targetPath = path.join(artifact.outputPath, path.relative(artifact.projectFolder, sourcePath));
        assert.deepEqual(await fileManager.readFileBytes(targetPath), content, `Vendored bytes differ: ${targetPath}`);
    }
}

async function verifyZip(fileManager: FileManager, artifact: PipelineArtifact): Promise<void> {
    const files = unzip(await fileManager.readFileBytes(artifact.outputPath));
    assert.ok(files['package.json'] !== undefined, 'Archive must include the package manifest');
    for (const [ sourcePath, content ] of artifact.vendorFiles) {
        const targetPath = path.relative(artifact.projectFolder, sourcePath).split(path.sep).join('/');
        const actual = files[targetPath];
        assert.ok(actual !== undefined, `Archive omitted ${targetPath}`);
        assert.deepEqual(Buffer.from(actual), content, `Archive changed ${targetPath}`);
    }
}

async function verifyTar(fileManager: FileManager, artifact: PipelineArtifact): Promise<void> {
    const entries = await extractTarEntries(await fileManager.readFileBytes(artifact.outputPath), {}, {
        maximumEntryCount: maximumArchiveEntries,
        maximumEntryPathLength: maximumArchivePathLength,
        maximumExtractedBytes: maximumArchiveBytes
    });
    const byName = new Map(entries.map(function (entry) {
        return [ entry.header.name, entry ];
    }));
    assert.ok(byName.has('package/package.json'), 'Archive must include the package manifest');
    for (const [ sourcePath, content ] of artifact.vendorFiles) {
        const targetPath = path.posix.join(
            'package',
            path.relative(artifact.projectFolder, sourcePath).split(path.sep).join('/')
        );
        const actual = byName.get(targetPath);
        assert.ok(actual !== undefined, `Archive omitted ${targetPath}`);
        assert.equal(actual.header.size, content.byteLength, `Archive changed the byte length of ${targetPath}`);
        assert.equal(actual.content, content.toString(), `Archive changed ${targetPath}`);
    }
}

export async function verifyPipelineArtifact(fileManager: FileManager, artifact: PipelineArtifact): Promise<void> {
    if (artifact.format === 'folder') {
        await verifyFolder(fileManager, artifact);
    } else if (artifact.format === 'zip') {
        await verifyZip(fileManager, artifact);
    } else {
        await verifyTar(fileManager, artifact);
    }
}

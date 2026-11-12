import assert from 'node:assert/strict';
import fileSystem from 'node:fs/promises';
import { createFileManager } from '../source/file-manager/file-manager.ts';
import { resolveAndLinkAll } from '../source/packages/packtory/packtory.entry-point.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';
import { createReleaseAnalysisMemoryWorkload, memoryWorkloadEntryCount } from './release-analysis-memory-workload.ts';

const entryCountArgumentIndex = 2;
const entryCount = Number(process.argv[entryCountArgumentIndex]);
assert.ok(entryCount === 1 || entryCount === memoryWorkloadEntryCount, 'Expected one or eight entry points');
const rootDirectory = await createTemporaryDirectory('packtory-benchmark-memory-');

async function measureMemory(): Promise<void> {
    const configuration = await createReleaseAnalysisMemoryWorkload(
        createFileManager({ hostFileSystem: fileSystem }),
        rootDirectory,
        entryCount
    );
    const { result } = await resolveAndLinkAll(configuration);
    assert.ok(result.isOk, `resolveAndLinkAll failed: ${result.isErr ? JSON.stringify(result.error) : ''}`);
    assert.equal(result.value.length, entryCount);
    process.stdout.write(`${process.resourceUsage().maxRSS}\n`);
}

try {
    await measureMemory();
} finally {
    await removeDirectory(rootDirectory);
}

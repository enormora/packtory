import fileSystem from 'node:fs/promises';
import path from 'node:path';
import { createFileManager, type FileManager } from '../source/file-manager/file-manager.ts';
import type { ThresholdsFile, WorkloadsFile } from './benchmark-types.ts';
import { formatMilliseconds, formatMultiplier } from './benchmark-formatting.ts';
import { readJavaScriptObjectNotationFile } from './benchmark-structured-data.ts';
import { parseThresholdsFile, parseWorkloadsFile } from './benchmark-file-codecs.ts';
import { measureNormalization } from './measure-normalization.ts';

export type BenchmarkFiles = { readonly thresholds: ThresholdsFile; readonly workloads: WorkloadsFile; };
export type BenchmarkConfiguration = {
    readonly files: BenchmarkFiles;
    readonly thresholdMultiplier: number;
    readonly fileManager: FileManager;
};

async function loadBenchmarkFiles(): Promise<BenchmarkFiles> {
    const directory = path.join(process.cwd(), 'benchmarks');
    const [ workloads, thresholds ] = await Promise.all([
        readJavaScriptObjectNotationFile(path.join(directory, 'workloads.json')),
        readJavaScriptObjectNotationFile(path.join(directory, 'thresholds.json'))
    ]);
    return { thresholds: parseThresholdsFile(thresholds), workloads: parseWorkloadsFile(workloads) };
}

export async function loadBenchmarkConfiguration(
    writeLine: (message: string) => void
): Promise<BenchmarkConfiguration> {
    const files = await loadBenchmarkFiles();
    const normalizationMilliseconds = await measureNormalization();
    const thresholdMultiplier = normalizationMilliseconds / files.thresholds.normalization.baselineMilliseconds;
    writeLine('');
    writeLine('Benchmark Normalization');
    writeLine(`- baseline workload median: ${formatMilliseconds(normalizationMilliseconds)}`);
    writeLine(`- threshold multiplier: ${formatMultiplier(thresholdMultiplier)}`);
    return { files, thresholdMultiplier, fileManager: createFileManager({ hostFileSystem: fileSystem }) };
}

import { buildAndPublishAll } from '../source/packages/packtory/packtory.entry-point.ts';
import type { ThroughputBenchmarkMeasurement, WorkloadsFile, WorkloadSize } from './benchmark-types.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';
import { startBenchmarkRegistry } from './benchmark-registry.ts';
import { generateWorkload } from './generate-workload.ts';
import { measureAsyncTask } from './tinybench-measurement.ts';

export async function runBuildArtifactsBenchmark(
    size: WorkloadSize,
    workloads: WorkloadsFile
): Promise<ThroughputBenchmarkMeasurement> {
    const rootDirectory = await createTemporaryDirectory(`packtory-benchmark-build-${size}-`);
    const registry = await startBenchmarkRegistry();

    try {
        const workload = await generateWorkload({ rootDirectory, size, workloads });
        const config = workload.createConfig(registry.settings);
        const result = await measureAsyncTask(`build-artifacts:${size}`, async () => {
            const { result: runResult } = await buildAndPublishAll(config, { dryRun: true, stage: false });

            if (runResult.isErr) {
                throw new Error(`buildAndPublishAll failed for "${size}" with error type "${runResult.error.type}"`);
            }
        });

        return {
            benchmarkName: 'build-artifacts',
            size,
            ...result
        };
    } finally {
        await registry.close();
        await removeDirectory(rootDirectory);
    }
}

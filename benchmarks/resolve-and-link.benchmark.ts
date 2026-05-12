import { resolveAndLinkAll } from '../source/packages/packtory/packtory.entry-point.ts';
import type { ThroughputBenchmarkMeasurement, WorkloadsFile, WorkloadSize } from './benchmark-types.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';
import { generateWorkload } from './generate-workload.ts';
import { measureAsyncTask } from './tinybench-measurement.ts';

export async function runResolveAndLinkBenchmark(
    size: WorkloadSize,
    workloads: WorkloadsFile
): Promise<ThroughputBenchmarkMeasurement> {
    const rootDirectory = await createTemporaryDirectory(`packtory-benchmark-resolve-${size}-`);

    try {
        const workload = await generateWorkload({ rootDirectory, size, workloads });
        const config = workload.createConfigWithoutRegistry();
        const result = await measureAsyncTask(`resolve-and-link:${size}`, async () => {
            const { result: runResult } = await resolveAndLinkAll(config);

            if (runResult.isErr) {
                throw new Error(`resolveAndLinkAll failed for "${size}" with error type "${runResult.error.type}"`);
            }
        });

        return {
            benchmarkName: 'resolve-and-link',
            size,
            ...result
        };
    } finally {
        await removeDirectory(rootDirectory);
    }
}

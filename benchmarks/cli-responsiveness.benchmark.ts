import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { CliResponsivenessMeasurement, CliWorkloadSize, WorkloadsFile } from './benchmark-types.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';
import { startBenchmarkRegistry } from './benchmark-registry.ts';
import { generateCliWorkload } from './generate-workload.ts';
import { measureAsyncTask } from './tinybench-measurement.ts';
import { calculateFrameGaps, collectWorstPerPackageGapMetrics } from './cli-spinner-metrics.ts';
import { ensureNodePtyHelperIsExecutable, runCliPublish } from './cli-publish-process.ts';

function createMeasuredFrameTimestampMap(packageNames: readonly string[]): Map<string, number[]> {
    return new Map(
        packageNames.map((packageName) => {
            return [packageName, [] as number[]] as const;
        })
    );
}

function recordMeasuredFrames(
    measuredPerPackageFrameTimestamps: Map<string, number[]>,
    measurement: Awaited<ReturnType<typeof runCliPublish>>
): void {
    measurement.perPackageFrameGapTimestamps.forEach((timestamps, packageName) => {
        const packageTimestamps = measuredPerPackageFrameTimestamps.get(packageName);

        if (packageTimestamps !== undefined) {
            packageTimestamps.push(...timestamps);
        }
    });
}

async function writeBenchmarkConfig(rootDirectory: string, configModuleText: string): Promise<void> {
    await fs.writeFile(path.join(rootDirectory, 'packtory.config.js'), configModuleText);
}

async function prepareCliBenchmark(
    size: CliWorkloadSize,
    rootDirectory: string,
    workloads: WorkloadsFile
): Promise<Awaited<ReturnType<typeof generateCliWorkload>>> {
    await ensureNodePtyHelperIsExecutable();
    const workload = await generateCliWorkload({ rootDirectory, size, workloads });
    return workload;
}

async function measureCliResponsiveness(
    size: CliWorkloadSize,
    rootDirectory: string,
    packageNames: readonly string[]
): Promise<{
    readonly frameCount: number;
    readonly p99FrameGapMs: number;
    readonly maxFrameGapMs: number;
    readonly result: Awaited<ReturnType<typeof measureAsyncTask>>;
}> {
    const measuredFrameGaps: number[] = [];
    const measuredPerPackageFrameTimestamps = createMeasuredFrameTimestampMap(packageNames);
    let latestFrameCount = 0;
    const result = await measureAsyncTask(`publish-cli:${size}`, async () => {
        const measurement = await runCliPublish(rootDirectory, packageNames);

        measuredFrameGaps.push(...calculateFrameGaps(measurement.allFrameGapTimestamps));
        recordMeasuredFrames(measuredPerPackageFrameTimestamps, measurement);
        latestFrameCount = measurement.frameCount;
    });

    assert.ok(measuredFrameGaps.length > 0, `CLI benchmark for "${size}" did not record any frame gaps`);

    const worstPerPackageGaps = collectWorstPerPackageGapMetrics(measuredPerPackageFrameTimestamps);

    return {
        frameCount: latestFrameCount,
        p99FrameGapMs: worstPerPackageGaps.p99FrameGapMs,
        maxFrameGapMs: worstPerPackageGaps.maxFrameGapMs,
        result
    };
}

export async function runCliResponsivenessBenchmark(
    size: CliWorkloadSize,
    workloads: WorkloadsFile
): Promise<CliResponsivenessMeasurement> {
    const rootDirectory = await createTemporaryDirectory(`packtory-benchmark-cli-${size}-`);
    const registry = await startBenchmarkRegistry();

    try {
        const workload = await prepareCliBenchmark(size, rootDirectory, workloads);
        await writeBenchmarkConfig(rootDirectory, workload.createConfigModuleText(registry.settings));
        const measurement = await measureCliResponsiveness(size, rootDirectory, workload.packageNames);

        return {
            benchmarkName: 'publish-cli',
            size,
            frameCount: measurement.frameCount,
            p99FrameGapMs: measurement.p99FrameGapMs,
            maxFrameGapMs: measurement.maxFrameGapMs,
            ...measurement.result
        };
    } finally {
        await registry.close();
        await removeDirectory(rootDirectory);
    }
}

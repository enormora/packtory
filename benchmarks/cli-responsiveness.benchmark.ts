import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { CliResponsivenessMeasurement, CliWorkloadSize, WorkloadsFile } from './benchmark-types.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';
import { startBenchmarkRegistry } from './benchmark-registry.ts';
import { generateCliWorkload } from './generate-workload.ts';
import { measureAsyncTask } from './tinybench-measurement.ts';
import { summarizeWorstPerPackageGaps } from './cli-spinner-metrics.ts';
import {
    ensureNodePtyHelperIsExecutable,
    runCliPublish,
    type CliPublishMeasurement,
    type EventLoopProbeReport
} from './cli-publish-process.ts';

type EventLoopAggregate = {
    readonly histogramP99Ms: number;
    readonly histogramMaxMs: number;
    readonly sampledMaxBlockMs: number;
};

function createPerPackageGapAccumulator(packageNames: readonly string[]): Map<string, number[]> {
    return new Map(
        packageNames.map((packageName) => {
            return [packageName, [] as number[]] as const;
        })
    );
}

function appendPerPackageGaps(
    accumulator: Map<string, number[]>,
    perRunGaps: ReadonlyMap<string, readonly number[]>
): void {
    perRunGaps.forEach((gaps, packageName) => {
        const target = accumulator.get(packageName);

        if (target !== undefined) {
            target.push(...gaps);
        }
    });
}

function recordEventLoopReport(reports: EventLoopProbeReport[], report: EventLoopProbeReport | undefined): void {
    if (report === undefined) {
        return;
    }
    reports.push(report);
}

function aggregateEventLoopReports(reports: readonly EventLoopProbeReport[]): EventLoopAggregate {
    let histogramP99Ms = 0;
    let histogramMaxMs = 0;
    let sampledMaxBlockMs = 0;

    for (const report of reports) {
        histogramP99Ms = Math.max(histogramP99Ms, report.histogram.p99);
        histogramMaxMs = Math.max(histogramMaxMs, report.histogram.max);

        for (const block of report.sampledBlocks) {
            sampledMaxBlockMs = Math.max(sampledMaxBlockMs, block.gapMs);
        }
    }

    return { histogramP99Ms, histogramMaxMs, sampledMaxBlockMs };
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
    readonly eventLoop: EventLoopAggregate;
    readonly result: Awaited<ReturnType<typeof measureAsyncTask>>;
}> {
    const perPackageFrameGaps = createPerPackageGapAccumulator(packageNames);
    const eventLoopReports: EventLoopProbeReport[] = [];
    let totalFrameCount = 0;
    let observedAnyGap = false;

    const result = await measureAsyncTask(`publish-cli:${size}`, async () => {
        const measurement: CliPublishMeasurement = await runCliPublish(rootDirectory, packageNames);

        if (measurement.allFrameGaps.length > 0) {
            observedAnyGap = true;
        }
        appendPerPackageGaps(perPackageFrameGaps, measurement.perPackageFrameGaps);
        totalFrameCount += measurement.frameCount;
        recordEventLoopReport(eventLoopReports, measurement.eventLoopReport);
    });

    assert.ok(observedAnyGap, `CLI benchmark for "${size}" did not record any frame gaps`);

    const worstPerPackageGaps = summarizeWorstPerPackageGaps(perPackageFrameGaps);
    const eventLoop = aggregateEventLoopReports(eventLoopReports);

    return {
        frameCount: totalFrameCount,
        p99FrameGapMs: worstPerPackageGaps.p99FrameGapMs,
        maxFrameGapMs: worstPerPackageGaps.maxFrameGapMs,
        eventLoop,
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
            eventLoopHistogramP99Ms: measurement.eventLoop.histogramP99Ms,
            eventLoopHistogramMaxMs: measurement.eventLoop.histogramMaxMs,
            eventLoopSampledMaxBlockMs: measurement.eventLoop.sampledMaxBlockMs,
            ...measurement.result
        };
    } finally {
        await registry.close();
        await removeDirectory(rootDirectory);
    }
}

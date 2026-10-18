import assert from 'node:assert/strict';
import path from 'node:path';
import fileSystem from 'node:fs/promises';
import type {
    CommandLineInterfaceResponsivenessMeasurement,
    CommandLineInterfaceWorkloadSize,
    WorkloadsFile
} from './benchmark-types.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';
import { startBenchmarkRegistry } from './benchmark-registry.ts';
import { generateCommandLineInterfaceWorkload } from './generate-workload.ts';
import { measureAsynchronousTask } from './tinybench-measurement.ts';
import { summarizeWorstPerPackageGaps } from './command-line-interface-spinner-metrics.ts';
import {
    ensureNodePseudoTerminalHelperIsExecutable,
    runCommandLineInterfacePublish,
    type CommandLineInterfacePublishMeasurement,
    type EventLoopProbeReport
} from './command-line-interface-publish-process.ts';

type EventLoopAggregate = {
    readonly histogramP99Milliseconds: number;
    readonly histogramMaximumMilliseconds: number;
    readonly sampledMaximumBlockMilliseconds: number;
};

function createPerPackageGapAccumulator(packageNames: readonly string[]): ReadonlyMap<string, number[]> {
    return new Map(
        packageNames.map(function (packageName) {
            return [ packageName, [] as number[] ] as const;
        })
    );
}

function appendPerPackageGaps(
    accumulator: ReadonlyMap<string, number[]>,
    perRunGaps: ReadonlyMap<string, readonly number[]>
): void {
    perRunGaps.forEach(function (gaps, packageName) {
        const target = accumulator.get(packageName);

        if (target !== undefined) {
            target.push(...gaps);
        }
    });
}

function appendEventLoopReport(
    reports: readonly EventLoopProbeReport[],
    report: EventLoopProbeReport | undefined
): readonly EventLoopProbeReport[] {
    if (report === undefined) {
        return reports;
    }

    return [ ...reports, report ];
}

function aggregateEventLoopReports(reports: readonly EventLoopProbeReport[]): EventLoopAggregate {
    let histogramP99Milliseconds = 0;
    let histogramMaximumMilliseconds = 0;
    let sampledMaximumBlockMilliseconds = 0;

    for (const report of reports) {
        histogramP99Milliseconds = Math.max(histogramP99Milliseconds, report.histogram.p99);
        histogramMaximumMilliseconds = Math.max(histogramMaximumMilliseconds, report.histogram.maximum);

        for (const block of report.sampledBlocks) {
            sampledMaximumBlockMilliseconds = Math.max(sampledMaximumBlockMilliseconds, block.gapMilliseconds);
        }
    }

    return { histogramP99Milliseconds, histogramMaximumMilliseconds, sampledMaximumBlockMilliseconds };
}

async function writeBenchmarkConfiguration(rootDirectory: string, configurationModuleText: string): Promise<void> {
    await fileSystem.writeFile(path.join(rootDirectory, 'packtory.config.js'), configurationModuleText);
}

async function prepareCommandLineInterfaceBenchmark(
    size: CommandLineInterfaceWorkloadSize,
    rootDirectory: string,
    workloads: WorkloadsFile
): Promise<Awaited<ReturnType<typeof generateCommandLineInterfaceWorkload>>> {
    await ensureNodePseudoTerminalHelperIsExecutable();
    const workload = await generateCommandLineInterfaceWorkload({ rootDirectory, size, workloads });
    return workload;
}

async function measureCommandLineInterfaceResponsiveness(
    size: CommandLineInterfaceWorkloadSize,
    rootDirectory: string,
    packageNames: readonly string[]
): Promise<{
    readonly frameCount: number;
    readonly p99FrameGapMilliseconds: number;
    readonly maximumFrameGapMilliseconds: number;
    readonly eventLoop: EventLoopAggregate;
    readonly result: Awaited<ReturnType<typeof measureAsynchronousTask>>;
}> {
    const perPackageFrameGaps = createPerPackageGapAccumulator(packageNames);
    let eventLoopReports: readonly EventLoopProbeReport[] = [];
    let totalFrameCount = 0;
    let observedAnyGap = false;

    const result = await measureAsynchronousTask(`publish-command-line-interface:${size}`, async function () {
        const measurement: CommandLineInterfacePublishMeasurement = await runCommandLineInterfacePublish(
            rootDirectory,
            packageNames
        );

        if (measurement.allFrameGaps.length > 0) {
            observedAnyGap = true;
        }
        appendPerPackageGaps(perPackageFrameGaps, measurement.perPackageFrameGaps);
        totalFrameCount += measurement.frameCount;
        eventLoopReports = appendEventLoopReport(eventLoopReports, measurement.eventLoopReport);
    });

    assert.ok(observedAnyGap, `CLI benchmark for "${size}" did not record any frame gaps`);

    const worstPerPackageGaps = summarizeWorstPerPackageGaps(perPackageFrameGaps);
    const eventLoop = aggregateEventLoopReports(eventLoopReports);

    return {
        frameCount: totalFrameCount,
        p99FrameGapMilliseconds: worstPerPackageGaps.p99FrameGapMilliseconds,
        maximumFrameGapMilliseconds: worstPerPackageGaps.maximumFrameGapMilliseconds,
        eventLoop,
        result
    };
}

export async function runCommandLineInterfaceResponsivenessBenchmark(
    size: CommandLineInterfaceWorkloadSize,
    workloads: WorkloadsFile
): Promise<CommandLineInterfaceResponsivenessMeasurement> {
    const rootDirectory = await createTemporaryDirectory(`packtory-benchmark-cli-${size}-`);
    const registry = await startBenchmarkRegistry();

    try {
        const workload = await prepareCommandLineInterfaceBenchmark(size, rootDirectory, workloads);
        await writeBenchmarkConfiguration(rootDirectory, workload.createConfigurationModuleText(registry.settings));
        const measurement = await measureCommandLineInterfaceResponsiveness(size, rootDirectory, workload.packageNames);

        return {
            benchmarkName: 'publish-command-line-interface',
            size,
            frameCount: measurement.frameCount,
            p99FrameGapMilliseconds: measurement.p99FrameGapMilliseconds,
            maximumFrameGapMilliseconds: measurement.maximumFrameGapMilliseconds,
            eventLoopHistogramP99Milliseconds: measurement.eventLoop.histogramP99Milliseconds,
            eventLoopHistogramMaximumMilliseconds: measurement.eventLoop.histogramMaximumMilliseconds,
            eventLoopSampledMaximumBlockMilliseconds: measurement.eventLoop.sampledMaximumBlockMilliseconds,
            ...measurement.result
        };
    } finally {
        await registry.close();
        await removeDirectory(rootDirectory);
    }
}

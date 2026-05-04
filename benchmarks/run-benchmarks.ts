/* eslint-disable no-console, @stylistic/indent-binary-ops, max-statements -- Benchmark runner intentionally prints status and orchestrates long-running script work. */

import path from 'node:path';
import {
    cliWorkloadSizes,
    workloadSizes,
    type CliResponsivenessMeasurement,
    type ThroughputBenchmarkMeasurement,
    type ThresholdsFile,
    type WorkloadsFile
} from './benchmark-types.ts';
import { formatMilliseconds, formatMultiplier, readJsonFile } from './benchmark-helpers.ts';
import { measureNormalization } from './measure-normalization.ts';
import { runResolveAndLinkBenchmark } from './resolve-and-link.benchmark.ts';
import { runBuildArtifactsBenchmark } from './build-artifacts.benchmark.ts';
import { runCliResponsivenessBenchmark } from './cli-responsiveness.benchmark.ts';

function getThresholdMultiplier(currentNormalizationMs: number, thresholds: ThresholdsFile): number {
    return currentNormalizationMs / thresholds.normalization.baselineMilliseconds;
}

function printHeading(title: string): void {
    console.log(`\n${title}`);
}

function printLine(message: string): void {
    console.log(message);
}

function evaluateThroughputMeasurement(
    measurement: ThroughputBenchmarkMeasurement,
    thresholds: ThresholdsFile,
    thresholdMultiplier: number
): void {
    const configuredThreshold = thresholds.throughput[measurement.benchmarkName][measurement.size].medianMs;
    const effectiveThreshold = configuredThreshold * thresholdMultiplier;

    printLine(
        `- ${measurement.benchmarkName}/${measurement.size}: median ${formatMilliseconds(measurement.medianMs)} ` +
            `threshold ${formatMilliseconds(effectiveThreshold)} samples ${measurement.sampleCount}`
    );

    if (measurement.medianMs > effectiveThreshold) {
        throw new Error(
            `${measurement.benchmarkName}/${measurement.size} exceeded its median threshold: ` +
                `${formatMilliseconds(measurement.medianMs)} > ${formatMilliseconds(effectiveThreshold)}`
        );
    }
}

function evaluateCliMeasurement(measurement: CliResponsivenessMeasurement, thresholds: ThresholdsFile): void {
    const configuredThreshold = thresholds.responsiveness['publish-cli'][measurement.size];

    printLine(
        `- ${measurement.benchmarkName}/${measurement.size}: median ${formatMilliseconds(measurement.medianMs)} ` +
            `p99 gap ${formatMilliseconds(measurement.p99FrameGapMs)} max gap ${formatMilliseconds(
                measurement.maxFrameGapMs
            )} frames ${measurement.frameCount} samples ${measurement.sampleCount}`
    );

    if (measurement.p99FrameGapMs > configuredThreshold.p99Ms) {
        throw new Error(
            `${measurement.benchmarkName}/${measurement.size} exceeded its p99 frame-gap threshold: ` +
                `${formatMilliseconds(measurement.p99FrameGapMs)} > ${formatMilliseconds(configuredThreshold.p99Ms)}`
        );
    }

    if (measurement.maxFrameGapMs > configuredThreshold.maxMs) {
        throw new Error(
            `${measurement.benchmarkName}/${measurement.size} exceeded its max frame-gap threshold: ` +
                `${formatMilliseconds(measurement.maxFrameGapMs)} > ${formatMilliseconds(configuredThreshold.maxMs)}`
        );
    }
}

async function main(): Promise<void> {
    const workloadsPath = path.join(process.cwd(), 'benchmarks/workloads.json');
    const thresholdsPath = path.join(process.cwd(), 'benchmarks/thresholds.json');
    const workloads = await readJsonFile<WorkloadsFile>(workloadsPath);
    const thresholds = await readJsonFile<ThresholdsFile>(thresholdsPath);

    const normalizationMs = measureNormalization();
    const thresholdMultiplier = getThresholdMultiplier(normalizationMs, thresholds);

    printHeading('Benchmark Normalization');
    printLine(`- baseline workload median: ${formatMilliseconds(normalizationMs)}`);
    printLine(`- threshold multiplier: ${formatMultiplier(thresholdMultiplier)}`);

    printHeading('Throughput Benchmarks');
    for (const size of workloadSizes) {
        const resolveMeasurement = await runResolveAndLinkBenchmark(size, workloads);
        evaluateThroughputMeasurement(resolveMeasurement, thresholds, thresholdMultiplier);
    }

    for (const size of workloadSizes) {
        const buildMeasurement = await runBuildArtifactsBenchmark(size, workloads);
        evaluateThroughputMeasurement(buildMeasurement, thresholds, thresholdMultiplier);
    }

    printHeading('CLI Responsiveness Benchmarks');
    printLine(`- spinner interval: ${thresholds.responsiveness['publish-cli'].intervalMs}ms`);
    for (const size of cliWorkloadSizes) {
        const cliMeasurement = await runCliResponsivenessBenchmark(size, workloads);
        evaluateCliMeasurement(cliMeasurement, thresholds);
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});

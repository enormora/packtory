import path from 'node:path';
import {
    cliWorkloadSizes,
    workloadSizes,
    type CliResponsivenessMeasurement,
    type ThresholdsFile,
    type ThroughputBenchmarkMeasurement
} from './benchmark-types.ts';
import { formatMilliseconds, formatMultiplier } from './benchmark-formatting.ts';
import { readJsonFile } from './benchmark-json.ts';
import { parseThresholdsFile, parseWorkloadsFile } from './benchmark-file-codecs.ts';
import { measureNormalization } from './measure-normalization.ts';
import { runResolveAndLinkBenchmark } from './resolve-and-link.benchmark.ts';
import { runBuildArtifactsBenchmark } from './build-artifacts.benchmark.ts';
import { runCliResponsivenessBenchmark } from './cli-responsiveness.benchmark.ts';

function writeLine(message: string): void {
    process.stdout.write(`${message}\n`);
}

function writeHeading(title: string): void {
    writeLine('');
    writeLine(title);
}

function getThresholdMultiplier(currentNormalizationMs: number, baselineMilliseconds: number): number {
    return currentNormalizationMs / baselineMilliseconds;
}

function formatThroughputRow(measurement: ThroughputBenchmarkMeasurement, effectiveThreshold: number): string {
    return [
        `- ${measurement.benchmarkName}/${measurement.size}:`,
        `median ${formatMilliseconds(measurement.medianMs)}`,
        `threshold ${formatMilliseconds(effectiveThreshold)}`,
        `samples ${measurement.sampleCount}`
    ].join(' ');
}

function formatCliRow(
    measurement: CliResponsivenessMeasurement,
    effectiveP99Threshold: number,
    effectiveMaxThreshold: number
): string {
    const p99Threshold = formatMilliseconds(effectiveP99Threshold);
    const maxThreshold = formatMilliseconds(effectiveMaxThreshold);
    return [
        `- ${measurement.benchmarkName}/${measurement.size}:`,
        `median ${formatMilliseconds(measurement.medianMs)}`,
        `p99 gap ${formatMilliseconds(measurement.p99FrameGapMs)} (threshold ${p99Threshold})`,
        `max gap ${formatMilliseconds(measurement.maxFrameGapMs)} (threshold ${maxThreshold})`,
        `loop p99 ${formatMilliseconds(measurement.eventLoopHistogramP99Ms)}`,
        `loop max ${formatMilliseconds(measurement.eventLoopHistogramMaxMs)}`,
        `loop block ${formatMilliseconds(measurement.eventLoopSampledMaxBlockMs)}`,
        `frames ${measurement.frameCount}`,
        `samples ${measurement.sampleCount}`
    ].join(' ');
}

function validateThroughputMeasurement(
    measurement: ThroughputBenchmarkMeasurement,
    configuredThresholdMs: number
): void {
    if (measurement.medianMs > configuredThresholdMs) {
        const details = `${formatMilliseconds(measurement.medianMs)} > ${formatMilliseconds(configuredThresholdMs)}`;
        throw new Error(`${measurement.benchmarkName}/${measurement.size} exceeded its median threshold: ${details}`);
    }
}

function validateCliMeasurement(
    measurement: CliResponsivenessMeasurement,
    p99ThresholdMs: number,
    maxThresholdMs: number
): void {
    if (measurement.p99FrameGapMs > p99ThresholdMs) {
        const details = `${formatMilliseconds(measurement.p99FrameGapMs)} > ${formatMilliseconds(p99ThresholdMs)}`;
        throw new Error(
            `${measurement.benchmarkName}/${measurement.size} exceeded its p99 frame-gap threshold: ${details}`
        );
    }

    if (measurement.maxFrameGapMs > maxThresholdMs) {
        const details = `${formatMilliseconds(measurement.maxFrameGapMs)} > ${formatMilliseconds(maxThresholdMs)}`;
        throw new Error(
            `${measurement.benchmarkName}/${measurement.size} exceeded its max frame-gap threshold: ${details}`
        );
    }
}

type BenchmarkFiles = {
    readonly thresholds: ThresholdsFile;
    readonly workloads: ReturnType<typeof parseWorkloadsFile>;
};

async function loadBenchmarkFiles(benchmarksDirectory: string): Promise<BenchmarkFiles> {
    const workloadsPath = path.join(benchmarksDirectory, 'workloads.json');
    const thresholdsPath = path.join(benchmarksDirectory, 'thresholds.json');

    const [rawWorkloads, rawThresholds] = await Promise.all([
        readJsonFile(workloadsPath),
        readJsonFile(thresholdsPath)
    ]);

    return {
        thresholds: parseThresholdsFile(rawThresholds),
        workloads: parseWorkloadsFile(rawWorkloads)
    };
}

async function runResolveBenchmarks(thresholdMultiplier: number, benchmarkFiles: BenchmarkFiles): Promise<void> {
    const { thresholds, workloads } = benchmarkFiles;

    writeHeading('Throughput Benchmarks');

    for (const size of workloadSizes) {
        const measurement = await runResolveAndLinkBenchmark(size, workloads);
        const configuredThresholdMs = thresholds.throughput['resolve-and-link'][size].medianMs * thresholdMultiplier;

        writeLine(formatThroughputRow(measurement, configuredThresholdMs));
        validateThroughputMeasurement(measurement, configuredThresholdMs);
    }
}

async function runBuildBenchmarks(thresholdMultiplier: number, benchmarkFiles: BenchmarkFiles): Promise<void> {
    const { thresholds, workloads } = benchmarkFiles;

    for (const size of workloadSizes) {
        const measurement = await runBuildArtifactsBenchmark(size, workloads);
        const configuredThresholdMs = thresholds.throughput['build-artifacts'][size].medianMs * thresholdMultiplier;

        writeLine(formatThroughputRow(measurement, configuredThresholdMs));
        validateThroughputMeasurement(measurement, configuredThresholdMs);
    }
}

async function runCliBenchmarks(thresholdMultiplier: number, benchmarkFiles: BenchmarkFiles): Promise<void> {
    const { thresholds, workloads } = benchmarkFiles;

    writeHeading('CLI Responsiveness Benchmarks');
    writeLine(`- spinner interval: ${thresholds.responsiveness['publish-cli'].intervalMs}ms`);

    for (const size of cliWorkloadSizes) {
        const measurement = await runCliResponsivenessBenchmark(size, workloads);
        const configuredThresholds = thresholds.responsiveness['publish-cli'][size];
        const scaledP99Ms = configuredThresholds.p99Ms * thresholdMultiplier;
        const scaledMaxMs = configuredThresholds.maxMs * thresholdMultiplier;

        writeLine(formatCliRow(measurement, scaledP99Ms, scaledMaxMs));
        validateCliMeasurement(measurement, scaledP99Ms, scaledMaxMs);
    }
}

function printNormalization(normalizationMs: number, thresholdMultiplier: number): void {
    writeHeading('Benchmark Normalization');
    writeLine(`- baseline workload median: ${formatMilliseconds(normalizationMs)}`);
    writeLine(`- threshold multiplier: ${formatMultiplier(thresholdMultiplier)}`);
}

async function main(): Promise<void> {
    const benchmarksDirectory = path.join(process.cwd(), 'benchmarks');
    const benchmarkFiles = await loadBenchmarkFiles(benchmarksDirectory);
    const normalizationMs = await measureNormalization();
    const thresholdMultiplier = getThresholdMultiplier(
        normalizationMs,
        benchmarkFiles.thresholds.normalization.baselineMilliseconds
    );

    printNormalization(normalizationMs, thresholdMultiplier);
    await runResolveBenchmarks(thresholdMultiplier, benchmarkFiles);
    await runBuildBenchmarks(thresholdMultiplier, benchmarkFiles);
    await runCliBenchmarks(thresholdMultiplier, benchmarkFiles);
}

await main().catch((error: unknown) => {
    const message = error instanceof Error ? `${error.stack ?? error.message}\n` : `${String(error)}\n`;
    process.stderr.write(message);
    process.exitCode = 1;
});

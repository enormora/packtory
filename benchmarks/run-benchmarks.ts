import path from 'node:path';
import {
    commandLineInterfaceWorkloadSizes,
    workloadSizes,
    type CommandLineInterfaceResponsivenessMeasurement,
    type ThresholdsFile,
    type ThroughputBenchmarkMeasurement,
    type WorkloadsFile
} from './benchmark-types.ts';
import { formatMilliseconds, formatMultiplier } from './benchmark-formatting.ts';
import { readJavaScriptObjectNotationFile } from './benchmark-structured-data.ts';
import { parseThresholdsFile, parseWorkloadsFile } from './benchmark-file-codecs.ts';
import { measureNormalization } from './measure-normalization.ts';
import { runResolveAndLinkBenchmark } from './resolve-and-link.benchmark.ts';
import { runBuildArtifactsBenchmark } from './build-artifacts.benchmark.ts';
import { runCommandLineInterfaceResponsivenessBenchmark } from './command-line-interface-responsiveness.benchmark.ts';

function writeLine(message: string): void {
    process.stdout.write(`${message}\n`);
}

function writeHeading(title: string): void {
    writeLine('');
    writeLine(title);
}

function getThresholdMultiplier(currentNormalizationMilliseconds: number, baselineMilliseconds: number): number {
    return currentNormalizationMilliseconds / baselineMilliseconds;
}

function formatThroughputRow(measurement: ThroughputBenchmarkMeasurement, effectiveThreshold: number): string {
    return [
        `- ${measurement.benchmarkName}/${measurement.size}:`,
        `median ${formatMilliseconds(measurement.medianMilliseconds)}`,
        `threshold ${formatMilliseconds(effectiveThreshold)}`,
        `samples ${measurement.sampleCount}`
    ]
        .join(' ');
}

function formatCommandLineInterfaceRow(
    measurement: CommandLineInterfaceResponsivenessMeasurement,
    effectiveP99Threshold: number,
    effectiveMaximumThreshold: number
): string {
    const p99Threshold = formatMilliseconds(effectiveP99Threshold);
    const maximumThreshold = formatMilliseconds(effectiveMaximumThreshold);
    return [
        `- ${measurement.benchmarkName}/${measurement.size}:`,
        `median ${formatMilliseconds(measurement.medianMilliseconds)}`,
        `p99 gap ${formatMilliseconds(measurement.p99FrameGapMilliseconds)} (threshold ${p99Threshold})`,
        `max gap ${formatMilliseconds(measurement.maximumFrameGapMilliseconds)} (threshold ${maximumThreshold})`,
        `loop p99 ${formatMilliseconds(measurement.eventLoopHistogramP99Milliseconds)}`,
        `loop max ${formatMilliseconds(measurement.eventLoopHistogramMaximumMilliseconds)}`,
        `loop block ${formatMilliseconds(measurement.eventLoopSampledMaximumBlockMilliseconds)}`,
        `frames ${measurement.frameCount}`,
        `samples ${measurement.sampleCount}`
    ]
        .join(' ');
}

function validateThroughputMeasurement(
    measurement: ThroughputBenchmarkMeasurement,
    configuredThresholdMilliseconds: number
): void {
    if (measurement.medianMilliseconds > configuredThresholdMilliseconds) {
        const details = `${formatMilliseconds(measurement.medianMilliseconds)} > ${
            formatMilliseconds(configuredThresholdMilliseconds)
        }`;
        throw new Error(`${measurement.benchmarkName}/${measurement.size} exceeded its median threshold: ${details}`);
    }
}

function validateCommandLineInterfaceMeasurement(
    measurement: CommandLineInterfaceResponsivenessMeasurement,
    p99ThresholdMilliseconds: number,
    maximumThresholdMilliseconds: number
): void {
    if (measurement.p99FrameGapMilliseconds > p99ThresholdMilliseconds) {
        const details = `${formatMilliseconds(measurement.p99FrameGapMilliseconds)} > ${
            formatMilliseconds(p99ThresholdMilliseconds)
        }`;
        throw new Error(
            `${measurement.benchmarkName}/${measurement.size} exceeded its p99 frame-gap threshold: ${details}`
        );
    }

    if (measurement.maximumFrameGapMilliseconds > maximumThresholdMilliseconds) {
        const details = `${formatMilliseconds(measurement.maximumFrameGapMilliseconds)} > ${
            formatMilliseconds(maximumThresholdMilliseconds)
        }`;
        throw new Error(
            `${measurement.benchmarkName}/${measurement.size} exceeded its max frame-gap threshold: ${details}`
        );
    }
}

type BenchmarkFiles = {
    readonly thresholds: ThresholdsFile;
    readonly workloads: WorkloadsFile;
};

async function loadBenchmarkFiles(benchmarksDirectory: string): Promise<BenchmarkFiles> {
    const workloadsPath = path.join(benchmarksDirectory, 'workloads.json');
    const thresholdsPath = path.join(benchmarksDirectory, 'thresholds.json');

    const [ rawWorkloads, rawThresholds ] = await Promise.all([
        readJavaScriptObjectNotationFile(workloadsPath),
        readJavaScriptObjectNotationFile(thresholdsPath)
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
        const configuredThresholdMilliseconds = thresholds.throughput['resolve-and-link'][size].medianMilliseconds *
            thresholdMultiplier;

        writeLine(formatThroughputRow(measurement, configuredThresholdMilliseconds));
        validateThroughputMeasurement(measurement, configuredThresholdMilliseconds);
    }
}

async function runBuildBenchmarks(thresholdMultiplier: number, benchmarkFiles: BenchmarkFiles): Promise<void> {
    const { thresholds, workloads } = benchmarkFiles;

    for (const size of workloadSizes) {
        const measurement = await runBuildArtifactsBenchmark(size, workloads);
        const configuredThresholdMilliseconds = thresholds.throughput['build-artifacts'][size].medianMilliseconds *
            thresholdMultiplier;

        writeLine(formatThroughputRow(measurement, configuredThresholdMilliseconds));
        validateThroughputMeasurement(measurement, configuredThresholdMilliseconds);
    }
}

async function runCommandLineInterfaceBenchmarks(
    thresholdMultiplier: number,
    benchmarkFiles: BenchmarkFiles
): Promise<void> {
    const { thresholds, workloads } = benchmarkFiles;

    writeHeading('CLI Responsiveness Benchmarks');
    writeLine(
        `- spinner interval: ${thresholds.responsiveness['publish-command-line-interface'].intervalMilliseconds}ms`
    );

    for (const size of commandLineInterfaceWorkloadSizes) {
        const measurement = await runCommandLineInterfaceResponsivenessBenchmark(size, workloads);
        const configuredThresholds = thresholds.responsiveness['publish-command-line-interface'][size];
        const scaledP99Milliseconds = configuredThresholds.p99Milliseconds * thresholdMultiplier;
        const scaledMaximumMilliseconds = configuredThresholds.maximumMilliseconds * thresholdMultiplier;

        writeLine(formatCommandLineInterfaceRow(measurement, scaledP99Milliseconds, scaledMaximumMilliseconds));
        validateCommandLineInterfaceMeasurement(measurement, scaledP99Milliseconds, scaledMaximumMilliseconds);
    }
}

function printNormalization(normalizationMilliseconds: number, thresholdMultiplier: number): void {
    writeHeading('Benchmark Normalization');
    writeLine(`- baseline workload median: ${formatMilliseconds(normalizationMilliseconds)}`);
    writeLine(`- threshold multiplier: ${formatMultiplier(thresholdMultiplier)}`);
}

async function main(): Promise<void> {
    const benchmarksDirectory = path.join(process.cwd(), 'benchmarks');
    const benchmarkFiles = await loadBenchmarkFiles(benchmarksDirectory);
    const normalizationMilliseconds = await measureNormalization();
    const thresholdMultiplier = getThresholdMultiplier(
        normalizationMilliseconds,
        benchmarkFiles.thresholds.normalization.baselineMilliseconds
    );

    printNormalization(normalizationMilliseconds, thresholdMultiplier);
    await runResolveBenchmarks(thresholdMultiplier, benchmarkFiles);
    await runBuildBenchmarks(thresholdMultiplier, benchmarkFiles);
    await runCommandLineInterfaceBenchmarks(thresholdMultiplier, benchmarkFiles);
}

await main().catch(function (error: unknown) {
    const message = error instanceof Error ? `${error.stack ?? error.message}\n` : `${String(error)}\n`;
    process.stderr.write(message);
    process.exitCode = 1;
});

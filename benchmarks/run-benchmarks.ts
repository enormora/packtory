import {
    loadBenchmarkConfiguration,
    type BenchmarkConfiguration,
    type BenchmarkFiles
} from './benchmark-configuration.ts';
import {
    commandLineInterfaceWorkloadSizes,
    workloadSizes,
    type CommandLineInterfaceResponsivenessMeasurement,
    type ThroughputBenchmarkMeasurement
} from './benchmark-types.ts';
import { formatMilliseconds } from './benchmark-formatting.ts';
import { runResolveAndLinkBenchmark } from './resolve-and-link.benchmark.ts';
import { runBuildArtifactsBenchmark } from './build-artifacts.benchmark.ts';
import { runCommandLineInterfaceResponsivenessBenchmark } from './command-line-interface-responsiveness.benchmark.ts';
import { runReleaseAnalysisMemoryBenchmark } from './release-analysis-memory.benchmark.ts';
import { createBenchmarkChecks, type BenchmarkCheck } from './benchmark-checks.ts';
import { runConsumerPerformanceBenchmarks } from './consumer-performance.benchmark.ts';
import { runPublicModuleUsageBenchmark } from './public-module-usage.benchmark.ts';

function writeLine(message: string): void {
    process.stdout.write(`${message}\n`);
}

function writeHeading(title: string): void {
    writeLine('');
    writeLine(title);
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

async function runResolveBenchmarks(
    thresholdMultiplier: number,
    benchmarkFiles: BenchmarkFiles,
    check: BenchmarkCheck
): Promise<void> {
    const { thresholds, workloads } = benchmarkFiles;

    writeHeading('Throughput Benchmarks');

    for (const size of workloadSizes) {
        await check(`resolve-and-link/${size}`, async function () {
            const measurement = await runResolveAndLinkBenchmark(size, workloads);
            const configuredThresholdMilliseconds = thresholds.throughput['resolve-and-link'][size].medianMilliseconds *
                thresholdMultiplier;

            writeLine(formatThroughputRow(measurement, configuredThresholdMilliseconds));
            validateThroughputMeasurement(measurement, configuredThresholdMilliseconds);
        });
    }
}

async function runBuildBenchmarks(
    thresholdMultiplier: number,
    benchmarkFiles: BenchmarkFiles,
    check: BenchmarkCheck
): Promise<void> {
    const { thresholds, workloads } = benchmarkFiles;

    for (const size of workloadSizes) {
        await check(`build-artifacts/${size}`, async function () {
            const measurement = await runBuildArtifactsBenchmark(size, workloads);
            const configuredThresholdMilliseconds = thresholds.throughput['build-artifacts'][size].medianMilliseconds *
                thresholdMultiplier;

            writeLine(formatThroughputRow(measurement, configuredThresholdMilliseconds));
            validateThroughputMeasurement(measurement, configuredThresholdMilliseconds);
        });
    }
}

async function runCommandLineInterfaceBenchmarks(
    thresholdMultiplier: number,
    benchmarkFiles: BenchmarkFiles,
    check: BenchmarkCheck
): Promise<void> {
    const { thresholds, workloads } = benchmarkFiles;

    writeHeading('CLI Responsiveness Benchmarks');
    writeLine(
        `- spinner interval: ${thresholds.responsiveness['publish-command-line-interface'].intervalMilliseconds}ms`
    );

    for (const size of commandLineInterfaceWorkloadSizes) {
        await check(`publish-command-line-interface/${size}`, async function () {
            const measurement = await runCommandLineInterfaceResponsivenessBenchmark(size, workloads);
            const configuredThresholds = thresholds.responsiveness['publish-command-line-interface'][size];
            const scaledP99Milliseconds = configuredThresholds.p99Milliseconds * thresholdMultiplier;
            const scaledMaximumMilliseconds = configuredThresholds.maximumMilliseconds * thresholdMultiplier;

            writeLine(formatCommandLineInterfaceRow(measurement, scaledP99Milliseconds, scaledMaximumMilliseconds));
            validateCommandLineInterfaceMeasurement(measurement, scaledP99Milliseconds, scaledMaximumMilliseconds);
        });
    }
}

async function runConfiguredBenchmarks(configuration: BenchmarkConfiguration, check: BenchmarkCheck): Promise<void> {
    const { files: benchmarkFiles, thresholdMultiplier } = configuration;
    writeHeading('Release Analysis Memory Benchmark');
    await check('release-analysis-memory', async function () {
        await runReleaseAnalysisMemoryBenchmark(benchmarkFiles.thresholds.performance.maximumAdditionalResidentMiB);
    });
    writeHeading('Analysis, Vendoring, Packing and Publishing Benchmarks');
    await check('public-module-usage/repeated-lookups', async function () {
        await runPublicModuleUsageBenchmark(benchmarkFiles.workloads.performanceWorkload, writeLine);
    });
    await runConsumerPerformanceBenchmarks(configuration, check, writeLine);
    await runResolveBenchmarks(thresholdMultiplier, benchmarkFiles, check);
    await runBuildBenchmarks(thresholdMultiplier, benchmarkFiles, check);
    await runCommandLineInterfaceBenchmarks(thresholdMultiplier, benchmarkFiles, check);
}

async function main(): Promise<void> {
    const checks = createBenchmarkChecks(writeLine);
    const configuration = await loadBenchmarkConfiguration(writeLine);
    await runConfiguredBenchmarks(configuration, checks.check);
    checks.finish();
}

await main().catch(function (error: unknown) {
    const message = error instanceof Error ? `${error.stack ?? error.message}\n` : `${String(error)}\n`;
    process.stderr.write(message);
    process.exitCode = 1;
});

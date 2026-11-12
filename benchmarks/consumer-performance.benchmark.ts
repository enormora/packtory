import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';
import { startBenchmarkRegistry } from './benchmark-registry.ts';
import { compilerAnalysisCases, runCompilerAnalysisBenchmark } from './compiler-analysis.benchmark.ts';
import { runVendoringBenchmark } from './vendoring.benchmark.ts';
import { vendoringCases } from './vendoring-workload.ts';
import { runPackingAndPublishingBenchmark } from './packing-and-publishing.benchmark.ts';
import { pipelineCases } from './pipeline-workload.ts';
import type { BenchmarkCheck } from './benchmark-checks.ts';
import type { BenchmarkConfiguration } from './benchmark-configuration.ts';
import { createPerformanceValidation, type PerformanceValidation } from './performance-benchmark-validation.ts';

export type PerformanceBenchmarkContext = {
    readonly configuration: BenchmarkConfiguration;
    readonly check: BenchmarkCheck;
    readonly writeLine: (message: string) => void;
};
type PerformanceEnvironment = {
    readonly rootDirectory: string;
    readonly fileManager: BenchmarkConfiguration['fileManager'];
    readonly validation: PerformanceValidation;
};

async function runPipelineCases(
    context: PerformanceBenchmarkContext,
    environment: PerformanceEnvironment,
    registry: Awaited<ReturnType<typeof startBenchmarkRegistry>>
): Promise<void> {
    for (const scenario of pipelineCases) {
        await context.check(`pipeline/${scenario.name}`, async function () {
            const measurement = await runPackingAndPublishingBenchmark(scenario, {
                definition: context.configuration.files.workloads.performanceWorkload,
                registrySettings: registry.settings
            });
            environment.validation.validate(measurement);
        });
    }
}

async function runPerformanceCases(
    context: PerformanceBenchmarkContext,
    environment: PerformanceEnvironment
): Promise<void> {
    for (const scenario of compilerAnalysisCases) {
        await context.check(`compiler-analysis/${scenario.name}`, async function () {
            environment.validation.validate(
                await runCompilerAnalysisBenchmark(
                    scenario,
                    environment.rootDirectory,
                    environment.fileManager,
                    context.configuration.files.workloads.performanceWorkload
                )
            );
        });
    }
    for (const name of vendoringCases) {
        await context.check(`vendoring/${name}`, async function () {
            environment.validation.validate(
                await runVendoringBenchmark(
                    name,
                    environment.rootDirectory,
                    environment.fileManager,
                    context.configuration.files.workloads.performanceWorkload
                )
            );
        });
    }
    const registry = await startBenchmarkRegistry();
    try {
        await runPipelineCases(context, environment, registry);
    } finally {
        await registry.close();
    }
    await environment.validation.checkScaling();
}

export async function runConsumerPerformanceBenchmarks(
    configuration: BenchmarkConfiguration,
    check: BenchmarkCheck,
    writeLine: (message: string) => void
): Promise<void> {
    const temporaryDirectory = await createTemporaryDirectory('packtory-benchmark-performance-');
    const { fileManager } = configuration;
    const context = { configuration, check, writeLine };
    const rootDirectory = await fileManager.getRealPath(temporaryDirectory);
    const validation = createPerformanceValidation(
        context.configuration.files.thresholds.performance,
        context.configuration.thresholdMultiplier,
        context.check,
        context.writeLine
    );
    try {
        await runPerformanceCases(context, { rootDirectory, fileManager, validation });
    } finally {
        await removeDirectory(rootDirectory);
    }
}

import { runPublicModuleUsageBenchmark, runPathReplacementBenchmark } from './peer-substitution.benchmark.ts';
import {
    runRuntimePreparationBenchmark,
    runNamespaceSizingBenchmark,
    runBindingReferenceBenchmark,
    runTypeAncestorBenchmark,
    runBindingSyntaxBenchmark
} from './runtime-analysis.benchmark.ts';
import { runPublishedDependencyBenchmark } from './publication.benchmark.ts';
import type { BenchmarkCheck } from './benchmark-checks.ts';
import type { BenchmarkConfiguration } from './benchmark-configuration.ts';

export async function runModuleAnalysisBenchmarks(
    configuration: BenchmarkConfiguration,
    check: BenchmarkCheck,
    writeLine: (message: string) => void
): Promise<void> {
    await check('public-module-usage/repeated-lookups', async function () {
        await runPublicModuleUsageBenchmark(configuration.files.workloads.performanceWorkload, writeLine);
    });
    await check('path-replacement/shared-peer-exports', async function () {
        await runPathReplacementBenchmark(configuration.thresholdMultiplier, writeLine);
    });
    await check('runtime-preparation/repeated-fixed-point', async function () {
        await runRuntimePreparationBenchmark(configuration.thresholdMultiplier, writeLine);
    });
    await check('namespace-analysis/saturated-syntax-budget', async function () {
        await runNamespaceSizingBenchmark(configuration.thresholdMultiplier, writeLine);
    });
    await check('binding-references/unchanged-program', async function () {
        await runBindingReferenceBenchmark(configuration.thresholdMultiplier, writeLine);
    });
    await check('published-dependencies/repository-lookup', async function () {
        await runPublishedDependencyBenchmark(configuration.thresholdMultiplier, writeLine);
    });
    await check('type-positions/shared-ancestors', async function () {
        await runTypeAncestorBenchmark(configuration.thresholdMultiplier, writeLine);
    });
    await check('binding-syntax/repeated-refinement', async function () {
        await runBindingSyntaxBenchmark(configuration.thresholdMultiplier, writeLine);
    });
}

import assert from 'node:assert/strict';
import { createPathReplacementLookup } from '../source/linker/replacement-lookup.ts';
import {
    createPathReplacementWorkload,
    type PathReplacementWorkload
} from '../source/test-libraries/path-replacement-workload.ts';
import { collectPublicModuleUsage } from '../source/package-surface/public-module-usage.ts';
import { createPublicModuleUsageWorkload } from '../source/test-libraries/public-module-usage-workload.ts';
import {
    runRuntimePreparationBenchmark,
    runNamespaceSizingBenchmark,
    runBindingReferenceBenchmark,
    runPublishedDependencyBenchmark
} from './runtime-analysis.benchmark.ts';
import type { BenchmarkCheck } from './benchmark-checks.ts';
import type { BenchmarkConfiguration } from './benchmark-configuration.ts';
import { measurePreparedAsynchronousTask } from './tinybench-measurement.ts';
import type { PerformanceWorkload } from './performance-benchmark-types.ts';

async function runPublicModuleUsageBenchmark(
    definition: PerformanceWorkload,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'public-module-usage/repeated-lookups';
    const reads: number[] = [];
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const moduleCount = definition.sourceFileCount * definition.entryPointCount;
        const single = createPublicModuleUsageWorkload({ moduleCount, importCount: 1, sourcesFolder: '/source' });
        collectPublicModuleUsage([ single.consumer, single.target ]);
        const repeated = createPublicModuleUsageWorkload({
            moduleCount,
            importCount: definition.exportsPerFile,
            sourcesFolder: '/source'
        });
        return async function () {
            assert.deepStrictEqual(
                collectPublicModuleUsage([ repeated.consumer, repeated.target ]),
                repeated.expectedUsage
            );
            assert.ok(single.surfaceReads() > 0);
            assert.strictEqual(
                repeated.surfaceReads(),
                single.surfaceReads(),
                'Additional imports must not rebuild public indexes'
            );
            reads.push(repeated.surfaceReads());
        };
    });
    writeLine(
        `- ${name}: median ${measurement.medianMilliseconds.toFixed(1)}ms, target surface inspections ${
            reads.at(-1)
        }, samples ${measurement.sampleCount}`
    );
}

const moduleCount = 64;
const exportsPerModule = 8;
const maximumMilliseconds = 250;
const repetitions = 2;

function assertRootAndUnownedRequests(
    lookup: ReturnType<typeof createPathReplacementLookup>,
    workload: PathReplacementWorkload
): void {
    const [ firstRequest ] = workload.requests;
    assert.ok(firstRequest !== undefined);
    const rootRequest = {
        ...firstRequest,
        inputFilePath: '/source/entry.js',
        requiredExportNames: new Set(workload.requests.flatMap(function (request) {
            return Array.from(request.requiredExportNames);
        })),
        requiresNamespaceExport: true
    };
    assert.deepStrictEqual(lookup([ rootRequest ]).importPathReplacements.get(rootRequest.inputFilePath), {
        packageName: workload.bundle.name,
        emittedSpecifier: workload.bundle.name
    });
    assert.strictEqual(
        lookup([ { ...firstRequest, inputFilePath: '/unrelated.js' } ]).importPathReplacements.size,
        0
    );
    assert.strictEqual(workload.sourceReads(), 0, 'Public roots and unowned sources must not read peer exports');
}

async function runPathReplacementBenchmark(
    thresholdMultiplier: number,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'path-replacement/shared-peer-exports';
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const workload = createPathReplacementWorkload(moduleCount, exportsPerModule);
        return async function () {
            const lookup = createPathReplacementLookup([], [ workload.bundle ]);
            assertRootAndUnownedRequests(lookup, workload);
            for (const request of workload.requests) {
                for (let repetition = 0; repetition < repetitions; repetition += 1) {
                    const result = lookup([ request ]);
                    assert.deepStrictEqual(result.importPathReplacements.get(request.inputFilePath), {
                        packageName: workload.bundle.name,
                        emittedSpecifier: workload.bundle.name
                    });
                }
            }
            assert.ok(
                workload.sourceReads() <= workload.bundle.contents.length,
                `Peer exports were read ${workload.sourceReads()} times for ${workload.bundle.contents.length} files`
            );
        };
    });
    writeLine(`- ${name}: median ${measurement.medianMilliseconds.toFixed(1)}ms, samples ${measurement.sampleCount}`);
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}

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
}

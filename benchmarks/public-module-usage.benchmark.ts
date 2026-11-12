import assert from 'node:assert/strict';
import { collectPublicModuleUsage } from '../source/package-surface/public-module-usage.ts';
import { createPublicModuleUsageWorkload } from '../source/test-libraries/public-module-usage-workload.ts';
import { measurePreparedAsynchronousTask } from './tinybench-measurement.ts';
import type { PerformanceWorkload } from './performance-benchmark-types.ts';

export async function runPublicModuleUsageBenchmark(
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

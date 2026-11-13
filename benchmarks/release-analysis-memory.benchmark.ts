import assert from 'node:assert/strict';
import { executeBenchmarkProcess } from './benchmark-process.ts';
import { memoryWorkloadEntryCount } from './release-analysis-memory-workload.ts';

const unitsPerBinaryStep = 1024;
const processTimeoutMilliseconds = 120_000;

async function measureMemory(entryCount: number): Promise<number> {
    const workerUrl = new URL('./release-analysis-memory-process.ts', import.meta.url);
    const peakResidentKiB = await executeBenchmarkProcess({
        worker: workerUrl,
        cwd: process.cwd(),
        arguments: [ String(entryCount) ],
        timeoutMilliseconds: processTimeoutMilliseconds
    });
    assert.ok(typeof peakResidentKiB === 'number' && Number.isFinite(peakResidentKiB) && peakResidentKiB > 0);
    return peakResidentKiB / unitsPerBinaryStep;
}

export async function runReleaseAnalysisMemoryBenchmark(maximumAdditionalResidentMiB: number): Promise<void> {
    const single = await measureMemory(1);
    const multiple = await measureMemory(memoryWorkloadEntryCount);
    const additionalResidentMiB = multiple - single;
    for (const [ entryCount, measurement ] of [ [ 1, single ], [ memoryWorkloadEntryCount, multiple ] ] as const) {
        process.stdout.write(
            `- release-analysis-memory/${entryCount} entries: peak RSS ${measurement.toFixed(1)} MiB\n`
        );
    }
    const failureMessage = [
        `Shared-folder entry points added ${additionalResidentMiB.toFixed(1)} MiB of peak RSS`,
        `(budget ${maximumAdditionalResidentMiB} MiB)`
    ]
        .join(' ');
    assert.ok(additionalResidentMiB <= maximumAdditionalResidentMiB, failureMessage);
}

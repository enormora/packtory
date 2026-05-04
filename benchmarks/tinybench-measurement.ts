import assert from 'node:assert/strict';
import { Bench, type Task } from 'tinybench';
import type { TinybenchMeasurement } from './benchmark-types.ts';
import { benchmarkMeasuredIterations, benchmarkWarmupIterations } from './tinybench-defaults.ts';

function hasStatistics(
    result: Task['result']
): result is Extract<Task['result'], { state: 'aborted-with-statistics' | 'completed' }> {
    return result.state === 'aborted-with-statistics' || result.state === 'completed';
}

export async function measureAsyncTask(name: string, execute: () => Promise<void>): Promise<TinybenchMeasurement> {
    const bench = new Bench({
        name,
        iterations: benchmarkMeasuredIterations,
        time: 0,
        warmup: true,
        warmupIterations: benchmarkWarmupIterations,
        warmupTime: 0,
        retainSamples: true,
        throws: true
    });

    bench.add(name, execute, { async: true });
    await bench.run();

    const [task] = bench.tasks;
    assert.ok(task !== undefined, `Benchmark task "${name}" is missing`);
    assert.ok(hasStatistics(task.result), `Benchmark task "${name}" did not complete successfully`);

    return {
        medianMs: task.result.latency.p50,
        sampleCount: task.result.latency.samplesCount
    };
}

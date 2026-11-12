import assert from 'node:assert/strict';
import { Bench, type Task } from 'tinybench';
import type { TinybenchMeasurement } from './benchmark-types.ts';
import {
    benchmarkMeasuredIterations,
    benchmarkWarmupIterations,
    performanceBenchmarkMeasuredIterations,
    performanceBenchmarkWarmupIterations
} from './tinybench-defaults.ts';

type BenchmarkSampling = { readonly measuredIterations: number; readonly warmupIterations: number; };

function hasStatistics(
    result: Task['result']
): result is Extract<Task['result'], { readonly state: 'aborted-with-statistics' | 'completed'; }> {
    return result.state === 'aborted-with-statistics' || result.state === 'completed';
}

async function measureTask(
    name: string,
    prepare: () => Promise<() => Promise<void>>,
    sampling: BenchmarkSampling
): Promise<TinybenchMeasurement> {
    let execute: (() => Promise<void>) | null = null;
    const bench = new Bench({
        name,
        iterations: sampling.measuredIterations,
        time: 0,
        warmup: true,
        warmupIterations: sampling.warmupIterations,
        warmupTime: 0,
        retainSamples: true,
        throws: true
    });

    bench.add(name, async function () {
        assert.ok(execute !== null, 'Benchmark iteration must be prepared before timing');
        await execute();
    }, {
        async: true,
        async beforeEach() {
            execute = await prepare();
        }
    });
    await bench.run();

    const [ task ] = bench.tasks;
    assert.ok(task !== undefined, `Benchmark task "${name}" is missing`);
    assert.ok(hasStatistics(task.result), `Benchmark task "${name}" did not complete successfully`);

    return {
        medianMilliseconds: task.result.latency.p50,
        sampleCount: task.result.latency.samplesCount
    };
}

export async function measureAsynchronousTask(
    name: string,
    execute: () => Promise<void>
): Promise<TinybenchMeasurement> {
    return measureTask(name, async function () {
        return execute;
    }, {
        measuredIterations: benchmarkMeasuredIterations,
        warmupIterations: benchmarkWarmupIterations
    });
}

export async function measurePreparedAsynchronousTask(
    name: string,
    prepare: () => Promise<() => Promise<void>>
): Promise<TinybenchMeasurement> {
    return measureTask(name, prepare, {
        measuredIterations: performanceBenchmarkMeasuredIterations,
        warmupIterations: performanceBenchmarkWarmupIterations
    });
}

/* eslint-disable complexity, node/no-process-env, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-assignment, array-func/prefer-array-from, unicorn/no-array-sort, @typescript-eslint/no-magic-numbers, perfectionist/sort-union-types -- Benchmark harness utilities intentionally favor direct script ergonomics. */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Bench } from 'tinybench';
import type { TinybenchMeasurement } from './benchmark-types.ts';

const warmupIterations = 10;
const measuredIterations = 30;

type CompletedTaskResult = {
    readonly state: 'completed' | 'aborted-with-statistics';
    readonly latency: {
        readonly p50: number;
        readonly samplesCount: number;
    };
};

function getEnvironmentVariable(variableName: string): string | undefined {
    const environment = process.env[variableName];
    return typeof environment === 'string' ? environment : undefined;
}

export async function createTemporaryDirectory(prefix: string): Promise<string> {
    const tempRootDirectory = getEnvironmentVariable('RUNNER_TEMP') ?? os.tmpdir();
    return fs.mkdtemp(path.join(tempRootDirectory, prefix));
}

export async function removeDirectory(directoryPath: string): Promise<void> {
    await fs.rm(directoryPath, { recursive: true, force: true });
}

export async function readJsonFile<TValue>(filePath: string): Promise<TValue> {
    const fileContents = await fs.readFile(filePath, 'utf8');
    return JSON.parse(fileContents) as TValue;
}

export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function isCompletedTaskResult(result: unknown): result is CompletedTaskResult {
    if (typeof result !== 'object' || result === null) {
        return false;
    }

    const state = Reflect.get(result, 'state');
    if (state !== 'completed' && state !== 'aborted-with-statistics') {
        return false;
    }

    const latency = Reflect.get(result, 'latency');
    if (typeof latency !== 'object' || latency === null) {
        return false;
    }

    return typeof Reflect.get(latency, 'p50') === 'number' && typeof Reflect.get(latency, 'samplesCount') === 'number';
}

export async function runTinybenchTask(name: string, execute: () => Promise<void>): Promise<TinybenchMeasurement> {
    for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
        await execute();
    }

    const bench = new Bench({
        name,
        iterations: measuredIterations,
        time: 0,
        warmup: false,
        retainSamples: true,
        throws: true
    });

    bench.add(name, execute, { async: true });
    await bench.run();

    const task = bench.getTask(name);
    assert(task !== undefined, `Benchmark task "${name}" is missing`);
    assert(isCompletedTaskResult(task.result), `Benchmark task "${name}" did not complete successfully`);

    return {
        medianMs: task.result.latency.p50,
        sampleCount: task.result.latency.samplesCount
    };
}

export function calculatePercentile(values: readonly number[], percentile: number): number {
    assert(values.length > 0, 'Cannot calculate a percentile from an empty value list');
    assert(percentile >= 0 && percentile <= 1, `Percentile must be between 0 and 1, received "${percentile}"`);

    const sortedValues = [...values].sort((left, right) => {
        return left - right;
    });
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    const normalizedIndex = Math.min(sortedValues.length - 1, Math.max(0, index));
    const value = sortedValues[normalizedIndex];

    assert(value !== undefined, 'Expected percentile calculation to produce a value');
    return value;
}

export function formatMilliseconds(value: number): string {
    return `${value.toFixed(2)}ms`;
}

export function formatMultiplier(value: number): string {
    return `${value.toFixed(3)}x`;
}

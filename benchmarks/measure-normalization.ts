import assert from 'node:assert/strict';
import { Bench } from 'tinybench';

const normalizationArrayLength = 65_536;
const normalizationIterationCount = 192;
const normalizationWarmupIterations = 5;
const normalizationMeasuredIterations = 5;
const leftModulus = 97;
const leftOffset = 0.5;
const rightModulus = 89;
const rightOffset = 1.5;
const leftScaleFactor = 1.0000001;
const rightScaleFactor = 0.9999999;
const normalizationRollover = 8192;
const minimumFiniteAccumulator = 0;

type NormalizationArrays = {
    readonly left: Float64Array;
    readonly right: Float64Array;
};

function createNormalizationArrays(): NormalizationArrays {
    const left = new Float64Array(normalizationArrayLength);
    const right = new Float64Array(normalizationArrayLength);

    for (let index = 0; index < normalizationArrayLength; index += 1) {
        left[index] = index % leftModulus + leftOffset;
        right[index] = index % rightModulus + rightOffset;
    }

    return { left, right };
}

function updateNormalizationValue(left: Float64Array, right: Float64Array, index: number): number {
    const workingLeft = left;
    const leftValue = workingLeft[index];
    const rightValue = right[index];

    assert.ok(
        leftValue !== undefined && rightValue !== undefined,
        `Expected typed-array values for normalization index ${index}`
    );

    workingLeft[index] = (leftValue * leftScaleFactor + rightValue * rightScaleFactor) % normalizationRollover;
    return workingLeft[index];
}

function updateAccumulator(left: Float64Array, right: Float64Array): number {
    const mutableLeft = left;
    let accumulator = 0;

    for (let iteration = 0; iteration < normalizationIterationCount; iteration += 1) {
        for (let index = 0; index < normalizationArrayLength; index += 1) {
            accumulator += updateNormalizationValue(mutableLeft, right, index);
        }
    }

    return accumulator;
}

function runNormalizationWorkload(): void {
    const { left, right } = createNormalizationArrays();
    const accumulator = updateAccumulator(left, right);

    if (!Number.isFinite(accumulator) || accumulator < minimumFiniteAccumulator) {
        throw new TypeError('Normalization workload produced a non-finite value');
    }
}

export async function measureNormalization(): Promise<number> {
    const bench = new Bench({
        name: 'normalization',
        iterations: normalizationMeasuredIterations,
        time: 0,
        warmup: true,
        warmupIterations: normalizationWarmupIterations,
        warmupTime: 0,
        throws: true
    });

    bench.add('normalization', runNormalizationWorkload);
    await bench.run();

    const [ task ] = bench.tasks;
    assert.ok(task !== undefined, 'Normalization benchmark task is missing');
    assert.ok(
        task.result.state === 'completed' || task.result.state === 'aborted-with-statistics',
        'Normalization benchmark did not complete successfully'
    );

    return task.result.latency.p50;
}

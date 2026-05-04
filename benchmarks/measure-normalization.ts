/* eslint-disable complexity, @typescript-eslint/no-shadow, max-statements, @typescript-eslint/no-magic-numbers, unicorn/numeric-separators-style, unicorn/prefer-type-error -- The normalization workload intentionally uses fixed numeric constants. */

import { performance } from 'node:perf_hooks';
import { calculatePercentile } from './benchmark-helpers.ts';

const normalizationSampleCount = 5;
const arrayLength = 65_536;
const iterationCount = 192;

function runNormalizationWorkload(): number {
    const left = new Float64Array(arrayLength);
    const right = new Float64Array(arrayLength);

    for (let index = 0; index < arrayLength; index += 1) {
        left[index] = (index % 97) + 0.5;
        right[index] = (index % 89) + 1.5;
    }

    let accumulator = 0;
    const startedAt = performance.now();

    for (let iteration = 0; iteration < iterationCount; iteration += 1) {
        for (let index = 0; index < arrayLength; index += 1) {
            const leftValue = left[index];
            const rightValue = right[index];

            if (leftValue === undefined || rightValue === undefined) {
                throw new Error(`Expected typed-array values for normalization index ${index}`);
            }

            left[index] = (leftValue * 1.0000001 + rightValue * 0.9999999) % 8192;
            const value = left[index];

            if (value === undefined) {
                throw new Error(`Expected left[${index}] to be defined`);
            }

            accumulator += value;
        }
    }

    if (!Number.isFinite(accumulator)) {
        throw new Error('Normalization workload produced a non-finite value');
    }

    return performance.now() - startedAt;
}

export function measureNormalization(): number {
    const samples: number[] = [];

    for (let sampleIndex = 0; sampleIndex < normalizationSampleCount; sampleIndex += 1) {
        samples.push(runNormalizationWorkload());
    }

    return calculatePercentile(samples, 0.5);
}

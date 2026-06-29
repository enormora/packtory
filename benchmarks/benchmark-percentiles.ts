import assert from 'node:assert/strict';

export function calculatePercentile(values: readonly number[], percentile: number): number {
    assert.ok(values.length > 0, 'Cannot calculate a percentile from an empty value list');
    assert.ok(percentile >= 0 && percentile <= 1, `Percentile must be between 0 and 1, received "${percentile}"`);

    const sortedValues = Array.from(values).toSorted(function (left, right) {
        return left - right;
    });
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    const normalizedIndex = Math.min(sortedValues.length - 1, Math.max(0, index));
    const value = sortedValues[normalizedIndex];

    assert.ok(value !== undefined, 'Expected percentile calculation to produce a value');
    return value;
}

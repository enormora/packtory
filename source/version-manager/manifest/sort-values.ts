/* eslint-disable complexity -- primitive comparator uses explicit type branches to avoid equivalent mutants */
type PrimitiveValue = boolean | number | string;

export type ComparisonResult = -1 | 0 | 1;

function comparePrimitiveValues(valueA: PrimitiveValue, valueB: PrimitiveValue): ComparisonResult {
    if (valueA < valueB) {
        return -1;
    }

    if (valueA > valueB) {
        return 1;
    }

    return 0;
}

export function compareValues(valueA: unknown, valueB: unknown): ComparisonResult {
    if (
        (typeof valueA === 'boolean' || typeof valueA === 'number' || typeof valueA === 'string') &&
        (typeof valueB === 'boolean' || typeof valueB === 'number' || typeof valueB === 'string')
    ) {
        return comparePrimitiveValues(valueA, valueB);
    }

    return 0;
}

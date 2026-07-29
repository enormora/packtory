const sortablePrimitiveTypes = new Set([ 'boolean', 'number', 'string' ]);

type SortablePrimitive = boolean | number | string;

function isSortablePrimitive(value: unknown): value is SortablePrimitive {
    return sortablePrimitiveTypes.has(typeof value);
}

function compareSortablePrimitives(valueA: SortablePrimitive, valueB: SortablePrimitive): number {
    if (valueA < valueB) {
        return -1;
    }

    if (valueA > valueB) {
        return 1;
    }

    return 0;
}

export function compareValues(valueA: unknown, valueB: unknown): number {
    if (!isSortablePrimitive(valueA) || !isSortablePrimitive(valueB)) {
        return 0;
    }

    return compareSortablePrimitives(valueA, valueB);
}

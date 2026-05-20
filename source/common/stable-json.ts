import { isArray, isPlainObject } from 'remeda';
import { compareValues } from './sort-values.ts';

const indentationSize = 4;
type RecordEntry = readonly [string, unknown];

type ShouldPreserveArrayOrder = (path: readonly string[]) => boolean;

export type SerializeStableJsonOptions = {
    readonly shouldPreserveArrayOrder?: ShouldPreserveArrayOrder;
};

function assertNoCircularStructures(value: unknown): void {
    const visitedObjects = new Set<unknown>();

    JSON.stringify(value, (_key, currentValue: unknown) => {
        if (typeof currentValue === 'object' && currentValue !== null) {
            if (visitedObjects.has(currentValue)) {
                throw new Error('Circular structures are not supported');
            }

            visitedObjects.add(currentValue);
        }

        return currentValue;
    });
}

function deepSortValue(
    value: unknown,
    shouldPreserveArrayOrder: ShouldPreserveArrayOrder | undefined,
    path: readonly string[]
): unknown {
    if (isArray(value)) {
        const mapped = value.map((entry, index) => {
            return deepSortValue(entry, shouldPreserveArrayOrder, [...path, String(index)]);
        });
        if (shouldPreserveArrayOrder?.(path) === true) {
            return mapped;
        }
        return mapped.toSorted(compareValues);
    }

    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .map<RecordEntry>(([key, nestedValue]) => {
                    return [key, deepSortValue(nestedValue, shouldPreserveArrayOrder, [...path, key])];
                })
                .toSorted(([leftKey]: RecordEntry, [rightKey]: RecordEntry) => {
                    return compareValues(leftKey, rightKey);
                })
        );
    }

    return value;
}

export function serializeStableJson(value: unknown, options: SerializeStableJsonOptions = {}): string {
    assertNoCircularStructures(value);
    const sortedValue = deepSortValue(value, options.shouldPreserveArrayOrder, []);
    return JSON.stringify(sortedValue, null, indentationSize);
}

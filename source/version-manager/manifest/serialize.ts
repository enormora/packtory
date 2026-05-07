import type { PackageJson } from 'type-fest';
import { compareValues } from './sort-values.ts';

const indentationSize = 4;
type RecordEntry = readonly [string, unknown];

function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function deepSortValue(value: unknown): unknown {
    if (isArray(value)) {
        return value.map(deepSortValue).toSorted(compareValues);
    }

    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .map<RecordEntry>(([key, nestedValue]) => {
                    return [key, deepSortValue(nestedValue)];
                })
                .toSorted(([leftKey]: RecordEntry, [rightKey]: RecordEntry) => {
                    return compareValues(leftKey, rightKey);
                })
        );
    }

    return value;
}

export function serializePackageJson(data: Readonly<PackageJson>): string {
    assertNoCircularStructures(data);
    const sortedData = deepSortValue(data);
    return JSON.stringify(sortedData, null, indentationSize);
}

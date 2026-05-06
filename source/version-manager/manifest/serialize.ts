import type { PackageJson } from 'type-fest';
import { entries, fromEntries, isPlainObject, mapValues, pipe, sortBy } from 'remeda';
import { compareValues } from './sort-values.ts';

const indentationSize = 4;

function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
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

    if (isPlainObject(value)) {
        return pipe(
            value,
            mapValues(deepSortValue),
            entries(),
            sortBy((entry) => {
                return entry[0];
            }),
            fromEntries()
        );
    }

    return value;
}

export function serializePackageJson(data: Readonly<PackageJson>): string {
    assertNoCircularStructures(data);
    const sortedData = deepSortValue(data);
    return JSON.stringify(sortedData, null, indentationSize);
}

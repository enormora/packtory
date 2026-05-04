import type { PackageJson } from 'type-fest';
import { compareValues, type ComparisonResult } from './sort-values.ts';

const indentationSize = 4;

type UnknownRecord = Record<string, unknown>;
type UnknownRecordEntry = readonly [key: string, value: unknown];

function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

function compareEntryKeys(entryA: UnknownRecordEntry, entryB: UnknownRecordEntry): ComparisonResult {
    const [keyA] = entryA;
    const [keyB] = entryB;

    return compareValues(keyA, keyB);
}

function isRecord(value: unknown): value is UnknownRecord {
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
        const entries = Object.entries(value);
        entries.sort(compareEntryKeys);

        return Object.fromEntries(
            entries.map(([propertyName, propertyValue]) => {
                return [propertyName, deepSortValue(propertyValue)];
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

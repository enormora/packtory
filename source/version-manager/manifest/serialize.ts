import type { PackageJson } from 'type-fest';

const indentationSize = 4;

type UnknownRecord = Record<string, unknown>;
type UnknownRecordEntry = readonly [key: string, value: unknown];

type ComparisonResult = -1 | 0 | 1;

function isPrimitive(value: unknown): value is boolean | number | string {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

function compareValues(valueA: unknown, valueB: unknown): ComparisonResult {
    if (isPrimitive(valueA) && isPrimitive(valueB)) {
        if (valueA < valueB) {
            return -1;
        }
        if (valueA > valueB) {
            return 1;
        }
    }

    return 0;
}

function compareEntryKeys(entryA: UnknownRecordEntry, entryB: UnknownRecordEntry): ComparisonResult {
    const [keyA] = entryA;
    const [keyB] = entryB;

    return compareValues(keyA, keyB);
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepSortValue(value: unknown, visitedObjects: readonly unknown[]): unknown {
    if (isArray(value)) {
        return value
            .map((item) => {
                return deepSortValue(item, visitedObjects);
            })
            .toSorted(compareValues);
    }

    if (isRecord(value)) {
        if (visitedObjects.includes(value)) {
            throw new Error('Circular structures are not supported');
        }

        const nextVisitedObjects = [...visitedObjects, value];
        const entries = Object.entries(value);
        entries.sort(compareEntryKeys);

        return Object.fromEntries(
            entries.map(([propertyName, propertyValue]) => {
                return [propertyName, deepSortValue(propertyValue, nextVisitedObjects)];
            })
        );
    }

    return value;
}

export function serializePackageJson(data: Readonly<PackageJson>): string {
    const sortedData = deepSortValue(data, []);
    return JSON.stringify(sortedData, null, indentationSize);
}

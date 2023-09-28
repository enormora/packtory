import type { PackageJson } from 'type-fest';

const indentationSize = 4;

type UnknownRecord = Record<string, unknown>;
type UnknownRecordEntry = readonly [key: string, value: unknown];

type ComparisonResult = -1 | 0 | 1;

function compareEntryKeys(entryA: UnknownRecordEntry, entryB: UnknownRecordEntry): ComparisonResult {
    const [keyA] = entryA;
    const [keyB] = entryB;

    if (keyA < keyB) {
        return -1;
    }
    if (keyA > keyB) {
        return 1;
    }

    return 0;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
}

function deepSort<T>(value: T, visitedObjects: readonly unknown[]): T {
    if (visitedObjects.includes(value)) {
        throw new Error('Circular structures are not supported');
    }

    if (isRecord(value)) {
        const entries = Object.entries(value);
        entries.sort(compareEntryKeys);

        return Object.fromEntries(
            entries.map(([propertyName, propertyValue]) => {
                return [propertyName, deepSort(propertyValue, [...visitedObjects, value])];
            })
        ) as T;
    }

    return value;
}

export function serializePackageJson(data: Readonly<PackageJson>): string {
    const sortedData = deepSort(data, []);
    return JSON.stringify(sortedData, null, indentationSize);
}

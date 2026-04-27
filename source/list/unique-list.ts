export function uniqueList<TValue>(
    values: readonly [TValue, ...(readonly TValue[])]
): readonly [TValue, ...(readonly TValue[])];
export function uniqueList<TValue>(values: readonly TValue[]): readonly TValue[];
export function uniqueList<TValue>(values: readonly TValue[]): readonly TValue[] {
    return Array.from(new Set(values));
}

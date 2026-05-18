export function getRequiredValue<TValue>(value: TValue | undefined, message: string): TValue {
    if (value === undefined) {
        throw new Error(message);
    }
    return value;
}

export function getRequiredArrayValue<TValue>(
    items: readonly TValue[],
    message: string
): readonly [TValue, ...(readonly TValue[])] {
    const [firstValue, ...remainingValues] = items;
    if (firstValue === undefined) {
        throw new Error(message);
    }
    return [firstValue, ...remainingValues];
}

export function mapRequiredArrayValue<TInput, TOutput>(
    items: readonly [TInput, ...(readonly TInput[])],
    mapper: (item: TInput) => TOutput
): readonly [TOutput, ...(readonly TOutput[])] {
    const [firstItem, ...remainingItems] = items;
    return [mapper(firstItem), ...remainingItems.map(mapper)];
}

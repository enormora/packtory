export function throwNonError(value: unknown): never {
    throw value;
}

export async function rejectWithNonError(value: unknown): Promise<never> {
    throwNonError(value);
}

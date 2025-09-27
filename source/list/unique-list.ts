export function uniqueList<const List extends readonly unknown[]>(values: List): Readonly<List> {
    return Array.from(new Set(values)) as unknown as List;
}

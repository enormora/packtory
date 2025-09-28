export function uniqueList<const List extends readonly unknown[]>(values: List): Readonly<List> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ok in this case
    return Array.from(new Set(values)) as unknown as List;
}

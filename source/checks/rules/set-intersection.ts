function intersectTwo(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
    const result = new Set<string>();
    for (const name of left) {
        if (right.has(name)) {
            result.add(name);
        }
    }
    return result;
}

export function intersectAll(
    sets: readonly [ReadonlySet<string>, ...(readonly ReadonlySet<string>[])]
): ReadonlySet<string> {
    const [first, ...rest] = sets;
    return rest.reduce<Set<string>>(intersectTwo, new Set(first));
}

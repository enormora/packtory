type BindingGraphNodes = ReadonlyMap<string, () => readonly string[]>;

export function collectBindingDependencies(identifier: string, nodes: BindingGraphNodes): readonly string[] {
    const pending = new Set([ identifier ]);
    const bindings = new Set<string>();
    for (const current of pending) {
        const neighbors = nodes.get(current);
        if (neighbors === undefined) {
            bindings.add(current);
        } else {
            neighbors().forEach(function (neighbor) {
                pending.add(neighbor);
            });
        }
    }
    return Array.from(bindings);
}

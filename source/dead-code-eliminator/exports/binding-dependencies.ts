import { createWorklist } from '../../common/worklist.ts';

type BindingGraphNodes = ReadonlyMap<string, () => readonly string[]>;

export function collectBindingDependencies(identifier: string, nodes: BindingGraphNodes): readonly string[] {
    const pending = createWorklist([ identifier ]);
    const visited = new Set([ identifier ]);
    const bindings = new Set<string>();
    for (let current = pending.takeNext(); current !== undefined; current = pending.takeNext()) {
        const neighbors = nodes.get(current);
        if (neighbors === undefined) {
            bindings.add(current);
        } else {
            neighbors().forEach(function (neighbor) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    pending.schedule(neighbor);
                }
            });
        }
    }
    return Array.from(bindings);
}

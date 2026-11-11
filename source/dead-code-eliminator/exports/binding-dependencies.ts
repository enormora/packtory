type BindingGraphNodes<Node> = Pick<ReadonlyMap<Node, () => Iterable<Node>>, 'get'>;

export function visitBindingDependencies<Node>(
    identifier: Node,
    nodes: BindingGraphNodes<Node>,
    visit: (node: Node, binding: boolean) => void
): void {
    const pending = new Set([ identifier ]);
    for (const current of pending) {
        const neighbors = nodes.get(current);
        visit(current, neighbors === undefined);
        if (neighbors !== undefined) {
            Iterator.from(neighbors()).forEach(function (neighbor) {
                pending.add(neighbor);
            });
        }
    }
}

export function collectBindingDependencies<Node>(identifier: Node, nodes: BindingGraphNodes<Node>): readonly Node[] {
    const bindings = new Set<Node>();
    visitBindingDependencies(identifier, nodes, function (node, binding) {
        if (binding) {
            bindings.add(node);
        }
    });
    return Array.from(bindings);
}

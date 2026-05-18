import { type DirectedGraph, createDirectedGraph } from '../directed-graph/graph.ts';
import { getBundledDependencies, type PackageConfigsByName } from './config.ts';

export function buildPackageGraph(packages: PackageConfigsByName): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    for (const packageConfig of Object.values(packages)) {
        graph.addNode(packageConfig.name, undefined);
    }

    for (const packageConfig of Object.values(packages)) {
        for (const dependency of getBundledDependencies(packageConfig)) {
            graph.connect({ from: packageConfig.name, to: dependency });
        }
    }

    return graph;
}

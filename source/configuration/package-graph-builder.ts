import { type DirectedGraph, createDirectedGraph } from '../directed-graph/graph.ts';
import { getBundledDependencies, type PackageConfigurationsByName } from './configuration.ts';

export function buildPackageGraph(packages: PackageConfigurationsByName): DirectedGraph<string, undefined> {
    const graph = createDirectedGraph<string, undefined>();

    for (const packageConfiguration of Object.values(packages)) {
        graph.addNode(packageConfiguration.name, undefined);
    }

    for (const packageConfiguration of Object.values(packages)) {
        for (const dependency of getBundledDependencies(packageConfiguration)) {
            graph.connect({ from: packageConfiguration.name, to: dependency });
        }
    }

    return graph;
}

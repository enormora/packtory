import type { DirectedGraph } from '../directed-graph/graph.ts';
import type { PackageConfiguration } from './configuration.ts';

export function validateDuplicatePackages(packages: readonly PackageConfiguration[]): readonly string[] {
    const knownPackageNames = new Set<string>();
    const issues: string[] = [];

    packages.forEach(function (packageConfiguration) {
        if (knownPackageNames.has(packageConfiguration.name)) {
            issues.push(`Duplicate package definition with the name "${packageConfiguration.name}"`);
        }
        knownPackageNames.add(packageConfiguration.name);
    });

    return issues;
}

export function validateCyclicDependencies(packageGraph: DirectedGraph<string, undefined>): readonly string[] {
    const cycles = packageGraph.detectCycles();
    return cycles.map(function (cycle) {
        return `Unexpected cyclic dependency path: [${cycle.join('→')}]`;
    });
}

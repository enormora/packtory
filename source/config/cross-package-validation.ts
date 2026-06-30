import type { DirectedGraph } from '../directed-graph/graph.ts';
import type { PackageConfig } from './config.ts';

export function validateDuplicatePackages(packages: readonly PackageConfig[]): readonly string[] {
    const knownPackageNames = new Set<string>();
    const issues: string[] = [];

    packages.forEach(function (packageConfig) {
        if (knownPackageNames.has(packageConfig.name)) {
            issues.push(`Duplicate package definition with the name "${packageConfig.name}"`);
        }
        knownPackageNames.add(packageConfig.name);
    });

    return issues;
}

export function validateCyclicDependencies(packageGraph: DirectedGraph<string, undefined>): readonly string[] {
    const cycles = packageGraph.detectCycles();
    return cycles.map(function (cycle) {
        return `Unexpected cyclic dependency path: [${cycle.join('→')}]`;
    });
}

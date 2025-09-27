import { uniqueList } from '../list/unique-list.js';

export type ExternalDependency = {
    readonly name: string;
    readonly referencedFrom: readonly [string, ...(readonly string[])];
};

export type ExternalDependencies = ReadonlyMap<string, ExternalDependency>;

export function mergeExternalDependencies(
    dependenciesA: ExternalDependencies,
    dependenciesB: ExternalDependencies
): ReadonlyMap<string, ExternalDependency> {
    const mergedDependencies = new Map<string, ExternalDependency>(dependenciesA.entries());

    for (const dependencyB of dependenciesB.values()) {
        const dependencyA = mergedDependencies.get(dependencyB.name);

        if (dependencyA === undefined) {
            mergedDependencies.set(dependencyB.name, dependencyB);
        } else {
            mergedDependencies.set(dependencyA.name, {
                name: dependencyA.name,
                referencedFrom: uniqueList([...dependencyA.referencedFrom, ...dependencyB.referencedFrom])
            });
        }
    }

    return mergedDependencies;
}

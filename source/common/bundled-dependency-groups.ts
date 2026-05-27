export const bundledDependencyGroup = {
    bundle: {
        propertyName: 'bundleDependencies',
        manifestProperty: 'dependencies',
        missingMessagePrefix: 'Bundle dependency',
        unusedLabel: 'bundle'
    },
    peer: {
        propertyName: 'bundlePeerDependencies',
        manifestProperty: 'peerDependencies',
        missingMessagePrefix: 'Bundle peer dependency',
        unusedLabel: 'bundle peer'
    }
} as const;

export const bundledDependencyGroups = [bundledDependencyGroup.bundle, bundledDependencyGroup.peer] as const;
export const bundledDependencyLookupOrder = [bundledDependencyGroup.peer, bundledDependencyGroup.bundle] as const;

type BundledDependencySource<T> = {
    readonly bundleDependencies?: readonly T[] | undefined;
    readonly bundlePeerDependencies?: readonly T[] | undefined;
};

export function bundledDependenciesFrom<T>(source: BundledDependencySource<T>): readonly T[] {
    const dependencies: T[] = [];

    for (const group of bundledDependencyGroups) {
        dependencies.push(...(source[group.propertyName] ?? []));
    }

    return dependencies;
}

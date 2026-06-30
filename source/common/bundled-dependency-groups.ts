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

type BundledDependencySource<T> = {
    readonly bundleDependencies?: readonly T[] | undefined;
    readonly bundlePeerDependencies?: readonly T[] | undefined;
};

export function bundledDependencyGroups(): readonly [
    (typeof bundledDependencyGroup)['bundle'],
    (typeof bundledDependencyGroup)['peer']
] {
    return [ bundledDependencyGroup.bundle, bundledDependencyGroup.peer ];
}

export function bundledDependencyLookupOrder(): readonly [
    (typeof bundledDependencyGroup)['peer'],
    (typeof bundledDependencyGroup)['bundle']
] {
    return [ bundledDependencyGroup.peer, bundledDependencyGroup.bundle ];
}

export function bundledDependenciesFrom<T>(source: BundledDependencySource<T>): readonly T[] {
    const dependencies: T[] = [];

    for (const group of bundledDependencyGroups()) {
        dependencies.push(...source[group.propertyName] ?? []);
    }

    return dependencies;
}

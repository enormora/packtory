import { unique } from 'remeda';

export type DependencyReference = {
    readonly sourceFilePath: string;
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
};

export type DependencySpecifierReference = {
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
};

export type NamedDependencySpecifierReference = DependencySpecifierReference & {
    readonly name: string;
};

export type ExternalDependency = {
    readonly name: string;
    readonly referencedFrom: readonly [string, ...(readonly string[])];
    readonly references?: readonly [DependencyReference, ...(readonly DependencyReference[])] | undefined;
};

export type ExternalDependencies = ReadonlyMap<string, ExternalDependency>;

function uniqueReferences(
    references: readonly DependencyReference[]
): readonly [DependencyReference, ...(readonly DependencyReference[])] | undefined {
    const keys = new Set<string>();
    const result: DependencyReference[] = [];

    for (const reference of references) {
        const key = `${reference.sourceFilePath}\0${reference.sourceSpecifier}\0${reference.emittedSpecifier}`;
        if (!keys.has(key)) {
            keys.add(key);
            result.push(reference);
        }
    }

    const [ first, ...rest ] = result;
    return first === undefined ? undefined : [ first, ...rest ];
}

function createExternalDependency(
    name: string,
    sourceFilePath: string,
    specifier: DependencySpecifierReference
): ExternalDependency {
    const reference = {
        sourceFilePath,
        sourceSpecifier: specifier.sourceSpecifier,
        emittedSpecifier: specifier.emittedSpecifier
    };
    return {
        name,
        referencedFrom: [ sourceFilePath ],
        references: [ reference ]
    };
}

export function mergeExternalDependencies(
    dependenciesA: ExternalDependencies,
    dependenciesB: ExternalDependencies
): ReadonlyMap<string, ExternalDependency> {
    const mergedDependencies = new Map<string, ExternalDependency>(dependenciesA);

    for (const dependencyB of dependenciesB.values()) {
        const dependencyA = mergedDependencies.get(dependencyB.name);

        if (dependencyA === undefined) {
            mergedDependencies.set(dependencyB.name, dependencyB);
        } else {
            const references = uniqueReferences([
                ...dependencyA.references ?? [],
                ...dependencyB.references ?? []
            ]);
            mergedDependencies.set(dependencyA.name, {
                name: dependencyA.name,
                referencedFrom: unique([ ...dependencyA.referencedFrom, ...dependencyB.referencedFrom ]),
                ...references === undefined ? {} : { references }
            });
        }
    }

    return mergedDependencies;
}

export function mergeExternalDependencyReference(
    reference: NamedDependencySpecifierReference,
    sourceFilePath: string,
    existingDependency: ExternalDependency | undefined
): ExternalDependency {
    const dependency = createExternalDependency(reference.name, sourceFilePath, reference);
    if (existingDependency === undefined) {
        return dependency;
    }
    return mergeExternalDependencies(
        new Map([ [ existingDependency.name, existingDependency ] ]),
        new Map([ [ dependency.name, dependency ] ])
    )
        .get(dependency.name) ?? dependency;
}

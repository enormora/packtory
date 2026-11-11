import { createWorklist } from '../../common/worklist.ts';

export const allNamespaceProperties = Symbol('allNamespaceProperties');
export type NamespaceDemand = ReadonlyMap<string, NamespaceDemand> | typeof allNamespaceProperties;
export const noNamespaceProperties: ReadonlyMap<string, NamespaceDemand> = new Map();

type PropertyDemands = ReadonlyMap<string, NamespaceDemand>;
type DemandCompletion = (demand: NamespaceDemand) => void;
type DemandMerge = {
    readonly schedule: (operation: () => void) => void;
    readonly merge: (left: NamespaceDemand | undefined, right: NamespaceDemand, complete: DemandCompletion) => void;
};

function mergePropertyDemands(
    left: PropertyDemands,
    right: PropertyDemands,
    operation: DemandMerge,
    complete: DemandCompletion
): void {
    if (left.size === 0) {
        complete(right);
        return;
    }
    const result = new Map(left);
    let changed = false;
    const properties = right.entries();
    function mergeNextProperty(): void {
        const next = properties.next();
        if (next.done === true) {
            complete(changed ? result : left);
            return;
        }
        const [ name, demand ] = next.value;
        operation.merge(left.get(name), demand, function (merged) {
            if (result.get(name) !== merged) {
                result.set(name, merged);
                changed = true;
            }
            operation.schedule(mergeNextProperty);
        });
    }
    operation.schedule(mergeNextProperty);
}

function mergeDemandPair(
    left: NamespaceDemand | undefined,
    right: NamespaceDemand,
    operation: DemandMerge,
    complete: DemandCompletion
): void {
    if (left === undefined) {
        complete(right);
        return;
    }
    if (left === allNamespaceProperties || right === allNamespaceProperties) {
        complete(allNamespaceProperties);
        return;
    }
    mergePropertyDemands(left, right, operation, complete);
}

export function mergeNamespaceDemand(left: NamespaceDemand, right: NamespaceDemand): NamespaceDemand {
    let result = left;
    const pending = createWorklist<() => void>([]);
    const operation: DemandMerge = {
        schedule: pending.schedule,
        merge(first, second, complete) {
            mergeDemandPair(first, second, operation, complete);
        }
    };
    operation.merge(left, right, function (merged) {
        result = merged;
    });
    for (let next = pending.takeNext(); next !== undefined; next = pending.takeNext()) {
        next();
    }
    return result;
}

export function namespacePropertyDemand(demand: NamespaceDemand, name: string): NamespaceDemand {
    return demand === allNamespaceProperties ? allNamespaceProperties : demand.get(name) ?? noNamespaceProperties;
}

export function namespaceMemberDemand(name: string, demand: NamespaceDemand): NamespaceDemand {
    return new Map([ [ name, demand ] ]);
}

export function namespaceProperties(demand: NamespaceDemand): ReadonlySet<string> | undefined {
    return demand === allNamespaceProperties ? undefined : new Set(demand.keys());
}

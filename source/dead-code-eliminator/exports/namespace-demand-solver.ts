import {
    allNamespaceProperties,
    mergeNamespaceDemand,
    noNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';

export type NamespaceDemandLimits = {
    readonly maximumQueries: number;
    readonly maximumEvaluations: number;
};

type DemandJob<Key> = { readonly key: Key; readonly evaluate: () => NamespaceDemand; };
export type NamespaceDemandSolver<Key> = {
    readonly read: (key: Key, evaluate: () => NamespaceDemand) => NamespaceDemand;
    readonly resolve: (key: Key, evaluate: () => NamespaceDemand) => NamespaceDemand;
};

export function createNamespaceDemandSolver<Key>(limits: NamespaceDemandLimits): NamespaceDemandSolver<Key> {
    let evaluating: DemandJob<Key> | null = null;
    let exhausted = false;
    let processed = 0;
    const state = {
        jobs: new Map<Key, DemandJob<Key>>(),
        values: new Map<DemandJob<Key>, NamespaceDemand>(),
        dependents: new Map<DemandJob<Key>, Set<DemandJob<Key>>>(),
        pending: new Set<DemandJob<Key>>(),
        isExhausted(): boolean {
            return exhausted;
        }
    };

    function jobFor(key: Key, evaluate: () => NamespaceDemand): DemandJob<Key> | undefined {
        const existing = state.jobs.get(key);
        if (existing !== undefined) {
            return existing;
        }
        if (state.jobs.size >= limits.maximumQueries) {
            exhausted = true;
            return undefined;
        }
        const job = { key, evaluate };
        state.jobs.set(key, job);
        state.pending.add(job);
        return job;
    }

    function dependOn(job: DemandJob<Key>): void {
        if (evaluating !== null) {
            const dependents = state.dependents.get(job) ?? new Set();
            dependents.add(evaluating);
            state.dependents.set(job, dependents);
        }
    }

    function read(key: Key, evaluate: () => NamespaceDemand): NamespaceDemand {
        if (state.isExhausted()) {
            return allNamespaceProperties;
        }
        const job = jobFor(key, evaluate);
        if (job === undefined) {
            return allNamespaceProperties;
        }
        dependOn(job);
        return state.values.get(job) ?? noNamespaceProperties;
    }

    function publish(job: DemandJob<Key>, observation: NamespaceDemand): void {
        const previous = state.values.get(job) ?? noNamespaceProperties;
        const next = mergeNamespaceDemand(previous, observation);
        if (next !== previous) {
            state.values.set(job, next);
            const dependents = state.dependents.get(job) ?? [];
            for (const dependent of dependents) {
                state.pending.add(dependent);
            }
        }
    }

    function evaluateJob(job: DemandJob<Key>): void {
        const previous = evaluating;
        evaluating = job;
        processed += 1;
        try {
            publish(job, job.evaluate());
        } catch (error) {
            exhausted = true;
            throw error;
        } finally {
            evaluating = previous;
        }
    }

    return {
        read,
        resolve(key, evaluate) {
            read(key, evaluate);
            for (const job of state.pending) {
                if (state.isExhausted() || processed >= limits.maximumEvaluations) {
                    exhausted = true;
                    return allNamespaceProperties;
                }
                state.pending.delete(job);
                evaluateJob(job);
            }
            return state.isExhausted() ? allNamespaceProperties : read(key, evaluate);
        }
    };
}

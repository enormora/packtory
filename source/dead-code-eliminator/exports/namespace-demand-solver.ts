import type { Node as TypeScriptMorphNode, SourceFile } from 'ts-morph';
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

const maximumDemandQueries = 2048;
const maximumDemandEvaluations = 32_768;

function* namespaceSyntaxNodes(node: TypeScriptMorphNode): Generator<TypeScriptMorphNode> {
    for (let index = 0; index < node.getChildCount(); index += 1) {
        const child = node.getChildAtIndex(index);
        yield child;
        yield* namespaceSyntaxNodes(child);
    }
}

export function namespaceSyntaxBudgetSize(files: readonly SourceFile[]): number {
    const maximumSyntaxBudgetSize = Math.ceil(Math.sqrt(maximumDemandEvaluations)) - 1;
    let syntaxNodes = 0;
    for (const source of files) {
        const syntax = namespaceSyntaxNodes(source);
        for (let node = syntax.next(); node.done !== true; node = syntax.next()) {
            syntaxNodes += 1;
            if (syntaxNodes === maximumSyntaxBudgetSize) {
                return syntaxNodes;
            }
        }
    }
    return syntaxNodes;
}

export function namespaceDemandLimits(syntaxSizes: readonly number[]): NamespaceDemandLimits {
    const syntaxNodes = syntaxSizes.reduce(function (total, size) {
        return total + size;
    }, 1);
    return {
        maximumQueries: maximumDemandQueries,
        maximumEvaluations: Math.min(maximumDemandEvaluations, syntaxNodes * syntaxNodes)
    };
}

type DemandJob = {
    readonly evaluate: () => NamespaceDemand;
    readonly demand: NamespaceDemand;
    readonly recordDemand: (demand: NamespaceDemand) => void;
};
export type NamespaceDemandSolver<Key> = {
    readonly read: (key: Key, evaluate: () => NamespaceDemand) => NamespaceDemand;
    readonly resolve: (key: Key, evaluate: () => NamespaceDemand) => NamespaceDemand;
};

function checkedLimits(limits: NamespaceDemandLimits): NamespaceDemandLimits {
    if (
        [ limits.maximumQueries, limits.maximumEvaluations ].some(function (limit) {
            return !(Number.isSafeInteger(limit) && limit >= 0);
        })
    ) {
        throw new RangeError('Namespace demand limits must be nonnegative safe integers');
    }
    return limits;
}

export function createNamespaceDemandSolver<Key>(limits: NamespaceDemandLimits): NamespaceDemandSolver<Key> {
    let evaluating: DemandJob | null = null;
    let exhausted = false;
    let processed = 0;
    const state = {
        limits: checkedLimits(limits),
        jobs: new Map<Key, DemandJob>(),
        dependents: new Map<DemandJob, Set<DemandJob>>(),
        pending: new Set<DemandJob>(),
        isExhausted(): boolean {
            return exhausted;
        }
    };

    function scheduleJob(key: Key, evaluate: () => NamespaceDemand): DemandJob | undefined {
        if (state.jobs.size >= state.limits.maximumQueries) {
            exhausted = true;
            return undefined;
        }
        let demand: NamespaceDemand = noNamespaceProperties;
        const job: DemandJob = {
            evaluate,
            get demand() {
                return demand;
            },
            recordDemand(next) {
                demand = next;
            }
        };
        state.jobs.set(key, job);
        state.pending.add(job);
        return job;
    }

    function dependOn(job: DemandJob): void {
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
        const job = state.jobs.get(key) ?? scheduleJob(key, evaluate);
        if (job === undefined) {
            return allNamespaceProperties;
        }
        dependOn(job);
        return job.demand;
    }

    function publish(job: DemandJob, observation: NamespaceDemand): void {
        const changes = new Set<NamespaceDemand>([ mergeNamespaceDemand(job.demand, observation) ]);
        changes.delete(job.demand);
        for (const next of changes) {
            job.recordDemand(next);
            const dependents = state.dependents.get(job) ?? [];
            for (const dependent of dependents) {
                state.pending.add(dependent);
            }
        }
    }

    function evaluateJob(job: DemandJob): void {
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
                if (state.isExhausted() || processed >= state.limits.maximumEvaluations) {
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

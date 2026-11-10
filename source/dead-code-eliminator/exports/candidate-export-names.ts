import type { SourceFile } from 'ts-morph';
import type { ModuleExportModel } from './module-export-model.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';

export type CandidateExportNames = {
    readonly names: ReadonlyMap<SourceFile, ReadonlySet<string>>;
    readonly opaque: ReadonlySet<SourceFile>;
};

export function collectCandidateExportNames(
    models: readonly ModuleExportModel[],
    resolveModule: ExportTargetResolver
): CandidateExportNames {
    const state = {
        models: new Map(models.map(function (model) {
            return [ model.source, model ];
        })),
        names: new Map<SourceFile, Set<string>>(),
        opaque: new Set<SourceFile>(),
        dependencies: new Map<SourceFile, Set<SourceFile>>(),
        dependents: new Map<SourceFile, Set<SourceFile>>(),
        pending: new Set<SourceFile>()
    };

    function namesFor(source: SourceFile): Set<string> {
        let names = state.names.get(source);
        if (names === undefined) {
            names = new Set();
            state.names.set(source, names);
        }
        return names;
    }

    function addStar(source: SourceFile, specifier: string | undefined): void {
        const target = specifier === undefined ? undefined : resolveModule(source, specifier);
        if (target === undefined || !state.models.has(target)) {
            state.opaque.add(source);
            return;
        }
        const dependencies = state.dependencies.get(source) ?? new Set();
        dependencies.add(target);
        state.dependencies.set(source, dependencies);
        const dependents = state.dependents.get(target) ?? new Set();
        dependents.add(source);
        state.dependents.set(target, dependents);
    }

    function initialize(model: ModuleExportModel): void {
        const names = namesFor(model.source);
        for (const name of model.entries.keys()) {
            names.add(name);
        }
        if (!model.closed) {
            state.opaque.add(model.source);
        }
        for (const star of model.stars) {
            addStar(model.source, star.specifier);
        }
        state.pending.add(model.source);
    }

    function inheritNames(source: SourceFile, target: SourceFile): void {
        if (state.opaque.has(target)) {
            state.opaque.add(source);
        }
        const names = namesFor(source);
        for (const name of namesFor(target)) {
            if (name !== 'default') {
                names.add(name);
            }
        }
    }

    function scheduleDependents(source: SourceFile): void {
        const dependents = state.dependents.get(source) ?? [];
        for (const dependent of dependents) {
            state.pending.add(dependent);
        }
    }

    function propagate(source: SourceFile): void {
        const previousSize = namesFor(source).size;
        const wasOpaque = state.opaque.has(source);
        const dependencies = state.dependencies.get(source) ?? [];
        for (const dependency of dependencies) {
            inheritNames(source, dependency);
        }
        if (namesFor(source).size !== previousSize || state.opaque.has(source) !== wasOpaque) {
            scheduleDependents(source);
        }
    }

    function settle(): void {
        for (const model of models) {
            initialize(model);
        }
        for (const source of state.pending) {
            state.pending.delete(source);
            propagate(source);
        }
    }
    settle();
    return { names: state.names, opaque: state.opaque };
}

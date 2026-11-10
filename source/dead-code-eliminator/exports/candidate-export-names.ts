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
        models: new Map<SourceFile | undefined, ModuleExportModel>(models.map(function (model) {
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
        const resolved = specifier === undefined ? undefined : resolveModule(source, specifier);
        const model = state.models.get(resolved);
        if (model === undefined) {
            state.opaque.add(source);
            return;
        }
        const target = model.source;
        state.dependencies.set(source, (state.dependencies.get(source) ?? new Set()).add(target));
        state.dependents.set(target, (state.dependents.get(target) ?? new Set()).add(source));
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
        state.dependents.get(source)?.forEach(function (dependent) {
            state.pending.add(dependent);
        });
    }

    function propagate(source: SourceFile): void {
        const previousSize = namesFor(source).size;
        const wasOpaque = state.opaque.has(source);
        state.dependencies.get(source)?.forEach(function (dependency) {
            inheritNames(source, dependency);
        });
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

import type { SourceFile } from 'ts-morph';
import type { ModuleExportModel } from './module-export-model.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';
import { visitBindingDependencies } from './binding-dependencies.ts';

export type CandidateExportNames = {
    readonly names: ReadonlyMap<SourceFile, ReadonlySet<string>>;
    readonly opaque: ReadonlySet<SourceFile>;
};

type ExportModuleGroup = {
    readonly source: SourceFile;
    readonly models: readonly ModuleExportModel[];
};

export function collectCandidateExportNames(
    models: readonly ModuleExportModel[],
    resolveModule: ExportTargetResolver
): CandidateExportNames {
    const grouped = Map.groupBy(models, function (model) {
        return model.source;
    });
    const registry = new Map<SourceFile | undefined, ExportModuleGroup>(
        Array.from(grouped, function ([ source, entries ]) {
            return [ source, { source, models: entries } ];
        })
    );
    const names = new Map<SourceFile, ReadonlySet<string>>();
    const opaque = new Set<SourceFile>();

    function* dependencies(group: ExportModuleGroup, owner: SourceFile): Iterable<ExportModuleGroup> {
        for (const model of group.models) {
            for (const star of model.stars) {
                const resolved = star.specifier === undefined ? undefined : resolveModule(group.source, star.specifier);
                const target = registry.get(resolved);
                if (target === undefined) {
                    opaque.add(owner);
                } else {
                    yield target;
                }
            }
        }
    }

    function collect(group: ExportModuleGroup): void {
        const visible = new Set(group.models.flatMap(function (model) {
            return Array.from(model.entries.keys());
        }));
        names.set(group.source, visible);
        visitBindingDependencies(group, {
            get(dependency) {
                return function () {
                    return dependencies(dependency, group.source);
                };
            }
        }, function (dependency) {
            for (const model of dependency.models) {
                if (!model.closed) {
                    opaque.add(group.source);
                }
                for (const name of model.entries.keys()) {
                    if (name !== 'default') {
                        visible.add(name);
                    }
                }
            }
        });
    }
    registry.forEach(collect);
    return { names, opaque };
}

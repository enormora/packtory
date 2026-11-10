import type { SourceFile } from 'ts-morph';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import { collectCandidateExportNames } from './candidate-export-names.ts';
import { sameExportOrigin, type ExportResolution, type ExportResolver } from './export-resolution.ts';
import type { ModuleExportModel } from './module-export-model.ts';
import { createModuleExportResolver, type ExportTargetResolver } from './module-export-resolver.ts';

export type ExportReference = { readonly source: SourceFile; readonly name: string; };
type ExportStatus = ExportResolution<SourceFile | undefined>['kind'];
export type ModuleExportIndex = {
    readonly models: ReadonlyMap<SourceFile, ModuleExportModel>;
    readonly candidates: (source: SourceFile) => ReadonlySet<string>;
    readonly names: (source: SourceFile) => ReadonlySet<string> | undefined;
    readonly status: (source: SourceFile, name: string) => ExportStatus;
    readonly sameExport: (left: ExportReference, right: ExportReference) => boolean;
    readonly binding: (source: SourceFile, name: string) => BindingDescriptor | undefined;
};

const noNames: ReadonlySet<string> = new Set();

function matchingOrigins(
    resolver: ExportResolver<SourceFile | undefined>,
    left: ExportReference,
    right: ExportReference
): boolean {
    const resolvedLeft = resolver.resolve(left.source, left.name);
    const resolvedRight = resolver.resolve(right.source, right.name);
    return resolvedLeft.kind === 'unique' && resolvedRight.kind === 'unique' &&
        sameExportOrigin(resolvedLeft.origin, resolvedRight.origin);
}

function bindingForResolution(
    resolution: ExportResolution<SourceFile | undefined>,
    models: ReadonlyMap<SourceFile | undefined, ModuleExportModel>
): BindingDescriptor | undefined {
    if (resolution.kind !== 'unique' || resolution.origin.kind !== 'binding') {
        return undefined;
    }
    const { module: source, name } = resolution.origin;
    return models.get(source)?.locals.get(name === '*default*' ? 'default' : name);
}

export function createModuleExportIndex(
    models: readonly ModuleExportModel[],
    resolveModule: ExportTargetResolver
): ModuleExportIndex {
    const state = {
        models: new Map(models.map(function (model) {
            return [ model.source, model ];
        })),
        candidates: collectCandidateExportNames(models, resolveModule),
        local: createModuleExportResolver(models, resolveModule, 'local'),
        canonical: createModuleExportResolver(models, resolveModule, 'canonical'),
        schemas: new Map<SourceFile, ReadonlySet<string> | undefined>()
    };

    function status(source: SourceFile, name: string): ExportStatus {
        const local = state.local.resolve(source, name);
        const canonical = state.canonical.resolve(source, name);
        return local.kind === canonical.kind ? local.kind : 'unknown';
    }

    function resolvedNames(source: SourceFile): ReadonlySet<string> | undefined {
        const candidates = state.candidates.names.get(source);
        if (candidates === undefined || state.candidates.opaque.has(source)) {
            return undefined;
        }
        const resolutions = Array.from(candidates, function (name) {
            return { name, status: status(source, name) };
        });
        if (
            resolutions.some(function (resolution) {
                return resolution.status === 'unknown';
            })
        ) {
            return undefined;
        }
        return new Set(
            resolutions
                .filter(function (resolution) {
                    return resolution.status === 'unique';
                })
                .map(function (resolution) {
                    return resolution.name;
                })
        );
    }

    return {
        models: state.models,
        candidates(source) {
            return state.candidates.names.get(source) ?? noNames;
        },
        names(source) {
            if (!state.schemas.has(source)) {
                state.schemas.set(source, resolvedNames(source));
            }
            return state.schemas.get(source);
        },
        status,
        binding(source, name) {
            return status(source, name) === 'unique'
                ? bindingForResolution(state.local.resolve(source, name), state.models)
                : undefined;
        },
        sameExport(left, right) {
            return matchingOrigins(state.local, left, right) && matchingOrigins(state.canonical, left, right);
        }
    };
}

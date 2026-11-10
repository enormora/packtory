import { match } from 'ts-pattern';

type BindingOrigin<Module> = { readonly kind: 'binding'; readonly module: Module; readonly name: string; };
type NamespaceOrigin<Module> = { readonly kind: 'namespace'; readonly module: Module; };
export type ExportOrigin<Module> = BindingOrigin<Module> | NamespaceOrigin<Module>;

type ForwardedExport<Module> = { readonly kind: 'forward'; readonly module: Module; readonly name: string; };
type OriginExport<Module> = { readonly kind: 'origin'; readonly origin: ExportOrigin<Module>; };
type UnknownExport = { readonly kind: 'unknown'; };
export type ExportEntry<Module> = ForwardedExport<Module> | OriginExport<Module> | UnknownExport;

export type ModuleExports<Module> = {
    readonly closed: boolean;
    readonly entries: ReadonlyMap<string, ExportEntry<Module>>;
    readonly stars: readonly Module[];
};

type UnresolvedExport = { readonly kind: 'ambiguous' | 'missing' | 'unknown'; };
type UniqueExport<Module> = { readonly kind: 'unique'; readonly origin: ExportOrigin<Module>; };
export type ExportResolution<Module> = UniqueExport<Module> | UnresolvedExport;
type NoOrigins = { readonly kind: 'none'; };
type AmbiguousOrigins = { readonly kind: 'ambiguous'; };
type KnownOrigins<Module> = AmbiguousOrigins | NoOrigins | UniqueExport<Module>;

type ExportQuery<Module> = {
    readonly module: Module;
    readonly name: string;
};

export type ExportResolver<Module> = {
    readonly resolve: (module: Module, name: string) => ExportResolution<Module>;
};

const noOrigins = { kind: 'none' } as const;
const ambiguousOrigins = { kind: 'ambiguous' } as const;

export function sameExportOrigin<Module>(left: ExportOrigin<Module>, right: ExportOrigin<Module>): boolean {
    if (left.kind === 'namespace') {
        return right.kind === 'namespace' && left.module === right.module;
    }
    return right.kind === 'binding' && left.module === right.module && left.name === right.name;
}

function mergeOrigins<Module>(left: KnownOrigins<Module>, right: KnownOrigins<Module>): KnownOrigins<Module> {
    if (left.kind === 'ambiguous' || right.kind === 'none') {
        return left;
    }
    if (right.kind === 'ambiguous' || left.kind === 'none') {
        return right;
    }
    return sameExportOrigin(left.origin, right.origin) ? left : ambiguousOrigins;
}

function resolutionOf<Module>(origins: KnownOrigins<Module>, unknown: boolean): ExportResolution<Module> {
    if (origins.kind === 'ambiguous') {
        return ambiguousOrigins;
    }
    if (unknown) {
        return { kind: 'unknown' };
    }
    return origins.kind === 'none' ? { kind: 'missing' } : origins;
}

export function createExportResolver<Module>(
    modules: ReadonlyMap<Module, ModuleExports<Module>>
): ExportResolver<Module> {
    const state = {
        queries: new Map<Module, Map<string, ExportQuery<Module>>>(),
        pending: new Set<ExportQuery<Module>>(),
        expanded: new Set<ExportQuery<Module>>(),
        unknown: new Set<ExportQuery<Module>>(),
        origins: new Map<ExportQuery<Module>, KnownOrigins<Module>>(),
        dependencies: new Map<ExportQuery<Module>, Set<ExportQuery<Module>>>(),
        dependents: new Map<ExportQuery<Module>, Set<ExportQuery<Module>>>()
    };

    function queryFor(module: Module, name: string): ExportQuery<Module> {
        let byName = state.queries.get(module);
        if (byName === undefined) {
            byName = new Map();
            state.queries.set(module, byName);
        }
        let query = byName.get(name);
        if (query === undefined) {
            query = { module, name };
            byName.set(name, query);
            state.pending.add(query);
        }
        return query;
    }

    function follow(query: ExportQuery<Module>, module: Module, name: string): void {
        const dependency = queryFor(module, name);
        const dependencies = state.dependencies.get(query) ?? new Set();
        dependencies.add(dependency);
        state.dependencies.set(query, dependencies);
        const dependents = state.dependents.get(dependency) ?? new Set();
        dependents.add(query);
        state.dependents.set(dependency, dependents);
    }

    function applyEntry(query: ExportQuery<Module>, entry: ExportEntry<Module>): void {
        match(entry)
            .with({ kind: 'origin' }, function (value) {
                state.origins.set(query, { kind: 'unique', origin: value.origin });
            })
            .with({ kind: 'forward' }, function (value) {
                follow(query, value.module, value.name);
            })
            .with({ kind: 'unknown' }, function () {
                state.unknown.add(query);
            })
            .exhaustive();
    }

    function inheritStars(query: ExportQuery<Module>, module: ModuleExports<Module>): void {
        if (!module.closed) {
            state.unknown.add(query);
            return;
        }
        if (query.name !== 'default') {
            for (const target of module.stars) {
                follow(query, target, query.name);
            }
        }
    }

    function expand(query: ExportQuery<Module>): void {
        const module = modules.get(query.module);
        if (module === undefined) {
            state.unknown.add(query);
            return;
        }
        const entry = module.entries.get(query.name);
        if (entry !== undefined) {
            applyEntry(query, entry);
            return;
        }
        inheritStars(query, module);
    }

    function inheritResolution(query: ExportQuery<Module>): void {
        let inherited = state.origins.get(query) ?? noOrigins;
        const dependencies = state.dependencies.get(query) ?? [];
        for (const dependency of dependencies) {
            if (state.unknown.has(dependency)) {
                state.unknown.add(query);
            }
            inherited = mergeOrigins(inherited, state.origins.get(dependency) ?? noOrigins);
        }
        state.origins.set(query, inherited);
    }

    function scheduleDependents(query: ExportQuery<Module>): void {
        const dependents = state.dependents.get(query) ?? [];
        for (const dependent of dependents) {
            state.pending.add(dependent);
        }
    }

    function propagate(query: ExportQuery<Module>): void {
        const previous = state.origins.get(query) ?? noOrigins;
        const wasUnknown = state.unknown.has(query);
        if (!state.expanded.has(query)) {
            state.expanded.add(query);
            expand(query);
        }
        inheritResolution(query);
        if (state.origins.get(query) !== previous || state.unknown.has(query) !== wasUnknown) {
            scheduleDependents(query);
        }
    }

    return {
        resolve(module, name) {
            const query = queryFor(module, name);
            for (const current of state.pending) {
                state.pending.delete(current);
                propagate(current);
            }
            return resolutionOf(state.origins.get(query) ?? noOrigins, state.unknown.has(query));
        }
    };
}

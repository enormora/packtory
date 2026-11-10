import { match } from 'ts-pattern';

export type ExportOrigin<Module> = { readonly module: Module; readonly name: string | undefined; };

type ForwardedExport<Module> = { readonly kind: 'forward'; readonly module: Module; readonly name: string; };
type OriginExport<Module> = { readonly kind: 'origin'; readonly origin: ExportOrigin<Module>; };
export type ExportEntry<Module> = ForwardedExport<Module> | OriginExport<Module> | null;

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
    readonly origins: KnownOrigins<Module>;
    readonly recordOrigins: (origins: KnownOrigins<Module>) => void;
};

export type ExportResolver<Module> = {
    readonly resolve: (module: Module, name: string) => ExportResolution<Module>;
};

const noOrigins = { kind: 'none' } as const;
const ambiguousOrigins = { kind: 'ambiguous' } as const;
const unknownOrigins = { kind: 'unknown' } as const;
type ExportFact<Module> = KnownOrigins<Module> | typeof unknownOrigins;
type UnknownExportQueries<Module> = Pick<Set<ExportQuery<Module>>, 'add'> & ReadonlySet<ExportQuery<Module>>;

function createExportQuery<Module>(module: Module, name: string): ExportQuery<Module> {
    let origins: KnownOrigins<Module> = noOrigins;
    return {
        module,
        name,
        get origins() {
            return origins;
        },
        recordOrigins(next) {
            origins = next;
        }
    };
}

export function sameExportOrigin<Module>(left: ExportOrigin<Module>, right: ExportOrigin<Module>): boolean {
    return left.module === right.module && left.name === right.name;
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

function exportFactRecipients<Module>(
    queries: ReadonlySet<ExportQuery<Module>>,
    unknown: ReadonlySet<ExportQuery<Module>>
): Map<ExportFact<Module>, Set<ExportQuery<Module>>> {
    const facts = new Map<ExportFact<Module>, Set<ExportQuery<Module>>>();
    for (const query of queries) {
        const origins = unknown.has(query) ? [ query.origins, unknownOrigins ] : [ query.origins ];
        for (const fact of origins) {
            const recipients = facts.get(fact) ?? new Set<ExportQuery<Module>>();
            recipients.add(query);
            facts.set(fact, recipients);
        }
    }
    return facts;
}

function propagateExportFacts<Module>(
    queries: ReadonlySet<ExportQuery<Module>>,
    dependents: ReadonlyMap<ExportQuery<Module>, ReadonlySet<ExportQuery<Module>>>,
    unknown: UnknownExportQueries<Module>
): void {
    for (const [ fact, recipients ] of exportFactRecipients(queries, unknown)) {
        for (const query of recipients) {
            if (fact.kind === 'unknown') {
                unknown.add(query);
            } else {
                query.recordOrigins(mergeOrigins(query.origins, fact));
            }
            dependents.get(query)?.forEach(function (dependent) {
                recipients.add(dependent);
            });
        }
    }
}

export function createExportResolver<Module>(
    modules: Pick<ReadonlyMap<Module, ModuleExports<Module>>, 'get'>
): ExportResolver<Module> {
    const state = {
        queries: new Map<Module, Map<string, ExportQuery<Module>>>(),
        pending: new Set<ExportQuery<Module>>(),
        unknown: new Set<ExportQuery<Module>>(),
        dependents: new Map<ExportQuery<Module>, Set<ExportQuery<Module>>>()
    };

    function scheduleQuery(module: Module, name: string): ExportQuery<Module> {
        const query = createExportQuery(module, name);
        state.pending.add(query);
        return query;
    }

    function queryFor(module: Module, name: string): ExportQuery<Module> {
        const byName = state.queries.get(module) ?? new Map<string, ExportQuery<Module>>();
        state.queries.set(module, byName);
        const query = byName.get(name) ?? scheduleQuery(module, name);
        byName.set(name, query);
        return query;
    }

    function follow(query: ExportQuery<Module>, module: Module, name: string): void {
        const dependency = queryFor(module, name);
        query.recordOrigins(mergeOrigins(query.origins, dependency.origins));
        if (state.unknown.has(dependency)) {
            state.unknown.add(query);
        }
        const dependents = state.dependents.get(dependency) ?? new Set<ExportQuery<Module>>();
        dependents.add(query);
        state.dependents.set(dependency, dependents);
    }

    function applyEntry(query: ExportQuery<Module>, entry: ExportEntry<Module>): void {
        match(entry)
            .with(null, function () {
                state.unknown.add(query);
            })
            .with({ kind: 'origin' }, function (value) {
                query.recordOrigins({ kind: 'unique', origin: value.origin });
            })
            .otherwise(function (value) {
                follow(query, value.module, value.name);
            });
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

    return {
        resolve(module, name) {
            const query = queryFor(module, name);
            for (const current of state.pending) {
                expand(current);
            }
            propagateExportFacts(state.pending, state.dependents, state.unknown);
            state.pending.clear();
            return resolutionOf(query.origins, state.unknown.has(query));
        }
    };
}

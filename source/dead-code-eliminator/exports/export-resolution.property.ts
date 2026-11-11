import assert from 'node:assert';
import fastCheck from 'fast-check';
import { hasProp } from 'remeda';
import { suite, test } from 'mocha';
import {
    createExportResolver,
    type ExportEntry,
    type ExportOrigin,
    type ExportResolution,
    type ModuleExports
} from './export-resolution.ts';

type TerminalExports = {
    readonly origins: readonly ExportOrigin<number>[];
    readonly unknown: boolean;
};

type ExportWalk = {
    readonly modules: ReadonlyMap<number, ModuleExports<number>>;
    readonly module: number;
    readonly name: string;
    readonly visited: ReadonlySet<string>;
};

type ModuleGraph = readonly {
    readonly closed: boolean;
    readonly entries: readonly (readonly [string, ExportEntry<number>])[];
    readonly stars: readonly number[];
}[];

const noTerminals: TerminalExports = { origins: [], unknown: false };
const opaqueTerminals: TerminalExports = { origins: [], unknown: true };

function entryTerminals(
    walk: ExportWalk,
    entry: ExportEntry<number>,
    visit: (walk: ExportWalk) => TerminalExports
): TerminalExports {
    if (entry === null) {
        return opaqueTerminals;
    }
    if (hasProp(entry, 'origin')) {
        return { origins: [ entry.origin ], unknown: false };
    }
    return visit({ ...walk, module: entry.module, name: entry.name });
}

function starTerminals(
    walk: ExportWalk,
    module: ModuleExports<number>,
    visit: (walk: ExportWalk) => TerminalExports
): TerminalExports {
    if (!module.closed) {
        return opaqueTerminals;
    }
    if (walk.name === 'default') {
        return noTerminals;
    }
    const branches = module.stars.map(function (target) {
        return visit({ ...walk, module: target });
    });
    return {
        origins: branches.flatMap(function (branch) {
            return branch.origins;
        }),
        unknown: branches.some(function (branch) {
            return branch.unknown;
        })
    };
}

function reachableTerminals(walk: ExportWalk): TerminalExports {
    const key = `${walk.module}:${walk.name}`;
    if (walk.visited.has(key)) {
        return noTerminals;
    }
    const module = walk.modules.get(walk.module);
    if (module === undefined) {
        return opaqueTerminals;
    }
    const next = { ...walk, visited: new Set([ ...walk.visited, key ]) };
    const entry = module.entries.get(walk.name);
    return entry === undefined
        ? starTerminals(next, module, reachableTerminals)
        : entryTerminals(next, entry, reachableTerminals);
}

function expectedResolution(
    modules: ReadonlyMap<number, ModuleExports<number>>,
    module: number,
    name: string
): ExportResolution<number> {
    const terminals = reachableTerminals({ modules, module, name, visited: new Set() });
    const identities = new Set(terminals.origins.map(function (origin) {
        return JSON.stringify(origin);
    }));
    if (identities.size > 1) {
        return { kind: 'ambiguous' };
    }
    if (terminals.unknown) {
        return { kind: 'unknown' };
    }
    const [ origin ] = terminals.origins;
    return origin === undefined ? { kind: 'missing' } : { kind: 'unique', origin };
}

function resolutionIdentity(resolution: ExportResolution<number>): ExportResolution<number> {
    return resolution.kind === 'unique'
        ? { kind: 'unique', origin: { module: resolution.origin.module, name: resolution.origin.name } }
        : resolution;
}

const originEntries = fastCheck.oneof(
    fastCheck.record({
        kind: fastCheck.constant('origin' as const),
        origin: fastCheck.record({
            module: fastCheck.nat({ max: 7 }),
            name: fastCheck.constantFrom('local', 'other')
        })
    }),
    fastCheck.record({
        kind: fastCheck.constant('origin' as const),
        origin: fastCheck.record({ name: fastCheck.constant(undefined), module: fastCheck.nat({ max: 7 }) })
    })
);

const entries = fastCheck.oneof(
    originEntries,
    fastCheck.record({
        module: fastCheck.nat({ max: 7 }),
        name: fastCheck.constantFrom('value', 'default')
    }),
    fastCheck.constant(null)
);

const moduleGraphs: fastCheck.Arbitrary<ModuleGraph> = fastCheck.array(
    fastCheck.record({
        closed: fastCheck.boolean(),
        entries: fastCheck.array(fastCheck.tuple(fastCheck.constantFrom('value', 'default'), entries), {
            maxLength: 3
        }),
        stars: fastCheck.uniqueArray(fastCheck.nat({ max: 7 }), { maxLength: 4 })
    }),
    { minLength: 1, maxLength: 7 }
);

function moduleQueries(
    _module: unknown,
    module: number
): readonly { readonly module: number; readonly name: string; }[] {
    return [ 'value', 'default' ].map(function (name) {
        return { module, name };
    });
}

suite('export resolution properties', function () {
    test('matches all terminating paths through cyclic graphs independently of query order', function () {
        const nullPrototypeOrigin = { __proto__: null, name: undefined, module: 1 };
        const equivalentOrigins: ModuleGraph = [
            {
                closed: false,
                entries: [ [ 'value', { kind: 'origin', origin: nullPrototypeOrigin } ] ],
                stars: []
            },
            { closed: false, entries: [], stars: [] },
            { closed: false, entries: [], stars: [] },
            { closed: true, entries: [], stars: [ 4, 0 ] },
            {
                closed: false,
                entries: [ [ 'value', { kind: 'origin', origin: { name: undefined, module: 1 } } ] ],
                stars: []
            }
        ];
        fastCheck.assert(
            fastCheck.property(moduleGraphs, function (graph) {
                const modules = new Map(graph.map(function (module, index) {
                    return [ index, { ...module, entries: new Map(module.entries) } ] as const;
                }));
                const resolver = createExportResolver(modules);
                const reverse = createExportResolver(modules);
                const queries = graph.flatMap(moduleQueries);
                for (const query of queries) {
                    assert.deepStrictEqual(
                        resolutionIdentity(resolver.resolve(query.module, query.name)),
                        resolutionIdentity(expectedResolution(
                            modules,
                            query.module,
                            query.name
                        ))
                    );
                }
                for (const query of queries.toReversed()) {
                    assert.deepStrictEqual(
                        resolutionIdentity(reverse.resolve(query.module, query.name)),
                        resolutionIdentity(resolver.resolve(query.module, query.name))
                    );
                }
            }),
            { numRuns: 500, examples: [ [ equivalentOrigins ] ] }
        );
    });
});

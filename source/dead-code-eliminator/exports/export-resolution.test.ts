import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createExportResolver,
    type ExportEntry,
    type ModuleExports,
    type ExportResolution
} from './export-resolution.ts';

function moduleExports(
    entries: readonly (readonly [string, ExportEntry<string>])[],
    stars: readonly string[]
): ModuleExports<string> {
    return { closed: true, entries: new Map(entries), stars };
}

function binding(module: string, name: string): ExportEntry<string> {
    return { kind: 'origin', origin: { module, name } };
}

function starModules(origins: Readonly<Record<string, ExportEntry<string>>>): Map<string, ModuleExports<string>> {
    const modules = new Map(
        Object.entries(origins).map(function ([ source, origin ]) {
            return [ source, moduleExports([ [ 'value', origin ] ], []) ];
        })
    );
    modules.set('entry', moduleExports([], Object.keys(origins)));
    return modules;
}

type OriginCase = {
    readonly name: string;
    readonly origins: Readonly<Record<string, ExportEntry<string>>>;
    readonly expected: ExportResolution<string>;
};

const originCases: readonly OriginCase[] = [
    {
        name: 'distinguishes equal export names with different defining modules',
        origins: { first: binding('first', 'value'), second: binding('second', 'value') },
        expected: { kind: 'ambiguous' }
    },
    {
        name: 'merges namespace origins by module identity',
        origins: {
            first: { kind: 'origin', origin: { name: undefined, module: 'shared' } },
            second: { kind: 'origin', origin: { name: undefined, module: 'shared' } }
        },
        expected: { kind: 'unique', origin: { name: undefined, module: 'shared' } }
    },
    {
        name: 'distinguishes namespace origins from local bindings',
        origins: {
            first: { kind: 'origin', origin: { name: undefined, module: 'shared' } },
            second: binding('shared', 'value')
        },
        expected: { kind: 'ambiguous' }
    },
    {
        name: 'distinguishes two bindings in the same module',
        origins: { first: binding('shared', 'first'), second: binding('shared', 'second') },
        expected: { kind: 'ambiguous' }
    },
    {
        name: 'distinguishes namespace origins from different modules',
        origins: {
            first: { kind: 'origin', origin: { name: undefined, module: 'first' } },
            second: { kind: 'origin', origin: { name: undefined, module: 'second' } }
        },
        expected: { kind: 'ambiguous' }
    }
];

suite('export resolution', function () {
    test('propagates a delayed ambiguous provider into an already known consumer', function () {
        const resolver = createExportResolver(
            new Map([
                [ 'entry', moduleExports([], [ 'delayed', 'known' ]) ],
                [ 'delayed', moduleExports([], [ 'first', 'second' ]) ],
                [ 'known', moduleExports([ [ 'value', binding('known', 'value') ] ], []) ],
                [ 'first', moduleExports([ [ 'value', binding('first', 'value') ] ], []) ],
                [ 'second', moduleExports([ [ 'value', binding('second', 'value') ] ], []) ]
            ])
        );
        assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'ambiguous' });
    });

    test('reads module entries once while settling forwarding dependencies', function () {
        let reads = 0;
        const resolver = createExportResolver(
            new Map([
                [ 'entry', {
                    closed: true,
                    stars: [ 'dependency' ],
                    get entries() {
                        reads += 1;
                        assert.strictEqual(reads, 1);
                        return new Map<string, ExportEntry<string>>();
                    }
                } ],
                [ 'dependency', moduleExports([ [ 'value', binding('dependency', 'value') ] ], []) ]
            ])
        );
        assert.deepStrictEqual(resolver.resolve('entry', 'value'), {
            kind: 'unique',
            origin: { module: 'dependency', name: 'value' }
        });
        assert.strictEqual(reads, 1);
    });

    suite('origin identity', function () {
        for (const fixture of originCases) {
            test(fixture.name, function () {
                const resolver = createExportResolver(starModules(fixture.origins));
                assert.deepStrictEqual(resolver.resolve('entry', 'value'), fixture.expected);
            });
        }
    });

    suite('defining bindings', function () {
        test('resolves a renamed export through its defining binding', function () {
            const resolver = createExportResolver(
                new Map([
                    [
                        'entry',
                        moduleExports([ [ 'alias', { kind: 'forward', module: 'dependency', name: 'public' } ] ], [])
                    ],
                    [ 'dependency', moduleExports([ [ 'public', binding('dependency', 'local') ] ], []) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'alias'), {
                kind: 'unique',
                origin: { module: 'dependency', name: 'local' }
            });
        });

        test('merges multiple paths to the same defining binding', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', moduleExports([], [ 'first', 'second' ]) ],
                    [ 'first', moduleExports([], [ 'shared' ]) ],
                    [
                        'second',
                        moduleExports([ [ 'value', { kind: 'forward', module: 'shared', name: 'value' } ] ], [])
                    ],
                    [ 'shared', moduleExports([ [ 'value', binding('shared', 'value') ] ], []) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), {
                kind: 'unique',
                origin: { module: 'shared', name: 'value' }
            });
        });

        test('lets explicit exports override conflicting stars', function () {
            const modules = starModules({ first: binding('first', 'value'), second: binding('second', 'value') });
            modules.set('entry', moduleExports([ [ 'value', binding('entry', 'own') ] ], [ 'first', 'second' ]));
            const resolver = createExportResolver(modules);
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), {
                kind: 'unique',
                origin: { module: 'entry', name: 'own' }
            });
        });

        test('omits default exports from star forwarding', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', moduleExports([], [ 'dependency' ]) ],
                    [ 'dependency', moduleExports([ [ 'default', binding('dependency', 'snapshot') ] ], []) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'default'), { kind: 'missing' });
        });

        test('follows explicit default forwarding', function () {
            const resolver = createExportResolver(
                new Map([
                    [
                        'entry',
                        moduleExports([ [ 'value', { kind: 'forward', module: 'dependency', name: 'default' } ] ], [])
                    ],
                    [ 'dependency', moduleExports([ [ 'default', binding('dependency', 'snapshot') ] ], []) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), {
                kind: 'unique',
                origin: { module: 'dependency', name: 'snapshot' }
            });
        });

        test('resolves cycles containing a defining binding', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', moduleExports([], [ 'cycle' ]) ],
                    [ 'cycle', moduleExports([], [ 'entry', 'shared' ]) ],
                    [ 'shared', moduleExports([ [ 'value', binding('shared', 'value') ] ], []) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), {
                kind: 'unique',
                origin: { module: 'shared', name: 'value' }
            });
            assert.deepStrictEqual(resolver.resolve('cycle', 'value'), resolver.resolve('entry', 'value'));
        });

        test('returns missing for cycles without a defining binding', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', moduleExports([], [ 'cycle' ]) ],
                    [ 'cycle', moduleExports([], [ 'entry' ]) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'missing' });
        });
    });

    suite('unknown and namespace exports', function () {
        test('inherits a previously resolved unknown dependency', function () {
            const resolver = createExportResolver(
                new Map([
                    [
                        'entry',
                        moduleExports([ [ 'value', { kind: 'forward', module: 'external', name: 'value' } ] ], [])
                    ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('external', 'value'), { kind: 'unknown' });
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'unknown' });
        });

        test('does not expand unknown entries as forwarding requests', function () {
            const resolver = createExportResolver({
                get(module: string): ModuleExports<string> {
                    assert.strictEqual(module, 'entry');
                    return moduleExports([ [ 'value', null ] ], []);
                }
            });
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'unknown' });
        });

        test('keeps unknown modules distinct from missing exports', function () {
            const resolver = createExportResolver(new Map([ [ 'entry', moduleExports([], [ 'external' ]) ] ]));
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'unknown' });
        });

        test('does not replace an unknown explicit export with a star export', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', moduleExports([ [ 'value', null ] ], [ 'shared' ]) ],
                    [ 'shared', moduleExports([ [ 'value', binding('shared', 'value') ] ], []) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'unknown' });
        });

        test('preserves proven ambiguity alongside unknown star sources', function () {
            const modules = starModules({ first: binding('first', 'value'), second: binding('second', 'value') });
            modules.set('entry', moduleExports([], [ 'external', 'first', 'second' ]));
            const resolver = createExportResolver(modules);
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'ambiguous' });
        });
    });

    suite('resolution boundaries', function () {
        test('retains a cached origin when another star dependency is missing', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', moduleExports([], [ 'known', 'empty' ]) ],
                    [ 'known', moduleExports([ [ 'value', binding('known', 'value') ] ], []) ],
                    [ 'empty', moduleExports([], []) ]
                ])
            );
            const expected = { kind: 'unique', origin: { module: 'known', name: 'value' } };
            assert.deepStrictEqual(resolver.resolve('known', 'value'), expected);
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), expected);
        });

        test('retains a cached ambiguity after another star supplies an origin', function () {
            const modules = starModules({ first: binding('first', 'value'), second: binding('second', 'value') });
            modules.set('wrapper', moduleExports([], [ 'first', 'entry' ]));
            const resolver = createExportResolver(modules);
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'ambiguous' });
            assert.deepStrictEqual(resolver.resolve('wrapper', 'value'), { kind: 'ambiguous' });
        });

        test('expands each module once in a cyclic forwarding graph', function () {
            const modules = new Map([
                [ 'first', moduleExports([ [ 'value', { kind: 'forward', module: 'second', name: 'value' } ] ], []) ],
                [ 'second', moduleExports([ [ 'value', { kind: 'forward', module: 'first', name: 'value' } ] ], []) ]
            ]);
            let expansions = 0;
            const resolver = createExportResolver({
                get(module: string) {
                    expansions += 1;
                    assert.ok(expansions <= 2);
                    return modules.get(module);
                }
            });
            assert.deepStrictEqual(resolver.resolve('first', 'value'), { kind: 'missing' });
            assert.deepStrictEqual(resolver.resolve('first', 'value'), { kind: 'missing' });
            assert.strictEqual(expansions, 2);
        });

        test('keeps ambiguity after encountering a third defining binding', function () {
            const resolver = createExportResolver(starModules({
                first: binding('first', 'value'),
                second: binding('second', 'value'),
                third: binding('third', 'value')
            }));
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'ambiguous' });
            assert.deepStrictEqual(resolver.resolve('first', 'value'), {
                kind: 'unique',
                origin: { module: 'first', name: 'value' }
            });
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'ambiguous' });
        });

        test('ignores missing paths alongside a unique binding', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', moduleExports([], [ 'empty', 'present' ]) ],
                    [ 'empty', moduleExports([], []) ],
                    [ 'present', moduleExports([ [ 'value', binding('present', 'value') ] ], []) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), {
                kind: 'unique',
                origin: { module: 'present', name: 'value' }
            });
        });

        test('keeps a known binding uncertain alongside an unknown path', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', moduleExports([], [ 'present', 'external' ]) ],
                    [ 'present', moduleExports([ [ 'value', binding('present', 'value') ] ], []) ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'unknown' });
        });

        test('does not assume an opaque module has no default export', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', { closed: false, entries: new Map(), stars: [] } ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'default'), { kind: 'unknown' });
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), { kind: 'unknown' });
        });

        test('resolves explicit exports even when other names are opaque', function () {
            const resolver = createExportResolver(
                new Map([
                    [ 'entry', {
                        closed: false,
                        entries: new Map([ [ 'value', binding('entry', 'local') ] ]),
                        stars: []
                    } ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('entry', 'value'), {
                kind: 'unique',
                origin: { module: 'entry', name: 'local' }
            });
        });

        test('terminates named forwarding cycles and resolves later independent queries', function () {
            const resolver = createExportResolver(
                new Map([
                    [
                        'first',
                        moduleExports([ [ 'value', { kind: 'forward', module: 'second', name: 'alias' } ], [
                            'other',
                            binding('first', 'other')
                        ] ], [])
                    ],
                    [
                        'second',
                        moduleExports([ [ 'alias', { kind: 'forward', module: 'first', name: 'value' } ] ], [])
                    ]
                ])
            );
            assert.deepStrictEqual(resolver.resolve('first', 'value'), { kind: 'missing' });
            assert.deepStrictEqual(resolver.resolve('first', 'other'), {
                kind: 'unique',
                origin: { module: 'first', name: 'other' }
            });
            assert.deepStrictEqual(resolver.resolve('second', 'alias'), { kind: 'missing' });
        });
    });
});

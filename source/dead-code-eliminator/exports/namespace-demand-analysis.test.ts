import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { createNamespaceDemandAnalysis } from './namespace-demand-analysis.ts';

type DemandFixture = {
    readonly properties: (file: string, name: string) => ReadonlySet<string> | undefined;
    readonly exported: (file: string, name: string) => ReadonlySet<string> | undefined;
};

const library = 'export const used=42;export const unused=13;export default {used:42};';
const conservativeReceivers = {
    isObserved() {
        return true;
    },
    receiverIsUnobserved() {
        return false;
    }
};

function analyze(files: Readonly<Record<string, string>>, publicFiles: readonly string[]): DemandFixture {
    const fixture = createExportModuleFixture(files, []);
    const analysis = createNamespaceDemandAnalysis(
        fixture.sources,
        new Set(publicFiles.map(fixture.source)),
        fixture.resolveModule,
        conservativeReceivers
    );
    return {
        properties(file, name) {
            const declaration = fixture.models.get(fixture.source(file))?.locals.get(name)?.declarationNode;
            assertDefined(declaration);
            return analysis.properties(declaration);
        },
        exported(file, name) {
            return analysis.exportProperties(fixture.source(file), name);
        }
    };
}

function observedExpression(expression: string): ReadonlySet<string> | undefined {
    return analyze({
        'index.js': `import * as ns from "./library.js";export function probe(){return ${expression};}`,
        'library.js': library
    }, [ 'index.js' ])
        .properties('index.js', 'ns');
}

suite('namespace demand analysis', function () {
    suite('expression observations', function () {
        const finite = [
            [ 'ns.used', 'used' ],
            [ '(ns).used', 'used' ],
            [ 'ns?.used', 'used' ],
            [ 'ns["used"]', 'used' ],
            [ 'ns[1e+21]', '1e+21' ],
            [ 'ns[5e-324]', '5e-324' ],
            [ 'ns[undefined]', 'undefined' ],
            [ 'ns.default.used', 'default' ]
        ] as const;
        for (const [ expression, name ] of finite) {
            test(`tracks ${expression}`, function () {
                assert.deepStrictEqual(observedExpression(expression), new Set([ name ]));
            });
        }
        for (
            const expression of [
                'Object.keys(ns)',
                'Object.values(ns)',
                'observe(ns)',
                'ns.used()',
                '(ns.used)()',
                'ns.used?.()',
                'ns?.used()',
                'ns["used"]()',
                'ns.used`value`'
            ]
        ) {
            test(`keeps complete namespace observations for ${expression}`, function () {
                assert.strictEqual(observedExpression(expression), undefined);
            });
        }
    });

    suite('binding and key facts', function () {
        test('follows a const alias to its property consumers', function () {
            const graph = analyze({
                'index.js':
                    'import * as ns from "./library.js";const alias=ns;export function probe(){return alias.used;}',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.properties('index.js', 'ns'), new Set([ 'used' ]));
        });

        test('keeps mutable aliases conservative', function () {
            const graph = analyze({
                'index.js':
                    'import * as ns from "./library.js";let alias=ns;export function probe(){return alias.used;}',
                'library.js': library
            }, [ 'index.js' ]);
            assert.strictEqual(graph.properties('index.js', 'ns'), undefined);
        });

        test('uses known const keys without rewriting their original reads', function () {
            const graph = analyze({
                'index.js': 'import * as ns from "./library.js";export const result=ns[key];const key="used";',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.properties('index.js', 'ns'), new Set([ 'used' ]));
        });

        test('keeps unknown computed keys conservative', function () {
            const graph = analyze({
                'index.js': 'import * as ns from "./library.js";export function probe(key){return ns[key];}',
                'library.js': library
            }, [ 'index.js' ]);
            assert.strictEqual(graph.properties('index.js', 'ns'), undefined);
        });

        test('retains an observed export even when its result is discarded', function () {
            const graph = analyze(
                { 'index.js': 'import * as ns from "./library.js";ns.used;', 'library.js': library },
                [ 'index.js' ]
            );
            assert.deepStrictEqual(graph.properties('index.js', 'ns'), new Set([ 'used' ]));
        });

        test('does not demand exports from an unused namespace binding', function () {
            const graph = analyze({
                'index.js': 'import * as ns from "./library.js";export const value=42;',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.properties('index.js', 'ns'), new Set());
        });
    });

    suite('module forwarding', function () {
        test('transfers named forwarding demand through an aliased default export', function () {
            const graph = analyze({
                'index.js':
                    'import {wrapped as forwarded} from "./forward.js";export function probe(){return forwarded.used;}',
                'forward.js': 'export {default as wrapped} from "./wrapper.js";',
                'wrapper.js': 'import * as ns from "./library.js";export default ns;',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.exported('wrapper.js', 'default'), new Set([ 'used' ]));
            assert.deepStrictEqual(graph.properties('index.js', 'forwarded'), new Set([ 'used' ]));
        });

        test('follows exported const aliases and their foreign import definitions', function () {
            const graph = analyze({
                'index.js':
                    'import {alias as forwarded} from "./wrapper.js";export function probe(){return forwarded.used;}',
                'wrapper.js': 'import * as ns from "./library.js";const local=ns;export {local as alias};',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.properties('wrapper.js', 'ns'), new Set([ 'used' ]));
            assert.deepStrictEqual(graph.properties('index.js', 'forwarded'), new Set([ 'used' ]));
        });

        suite('default namespace snapshots', function () {
            for (
                const snapshot of [
                    'export default ns;',
                    'const alias=ns;export default alias;',
                    'export default (ns);'
                ]
            ) {
                test(`projects ${snapshot} through named consumer properties`, function () {
                    const graph = analyze({
                        'index.js':
                            'import forwarded from "./wrapper.js";export function probe(){return forwarded.used;}',
                        'wrapper.js': `import * as ns from "./library.js";${snapshot}`,
                        'library.js': library
                    }, [ 'index.js' ]);
                    assert.deepStrictEqual(graph.properties('wrapper.js', 'ns'), new Set([ 'used' ]));
                    assert.deepStrictEqual(graph.exported('wrapper.js', 'default'), new Set([ 'used' ]));
                    assert.deepStrictEqual(graph.properties('index.js', 'forwarded'), new Set([ 'used' ]));
                });
            }
        });

        test('projects named namespace reexports', function () {
            const graph = analyze({
                'index.js': 'import {wrapped as ns} from "./wrapper.js";export function probe(){return ns.used;}',
                'wrapper.js': 'export * as wrapped from "./library.js";',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.exported('wrapper.js', 'wrapped'), new Set([ 'used' ]));
            assert.deepStrictEqual(graph.properties('index.js', 'ns'), new Set([ 'used' ]));
            assert.strictEqual(graph.exported('library.js', 'used'), undefined);
            assert.deepStrictEqual(graph.exported('library.js', 'unused'), new Set());
        });

        test('follows ordinary star forwarding without forwarding default', function () {
            const graph = analyze({
                'index.js': 'import * as ns from "./wrapper.js";export function probe(){return Object.keys(ns);}',
                'wrapper.js': 'export * from "./library.js";',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.exported('library.js', 'default'), new Set());
            assert.strictEqual(graph.exported('library.js', 'used'), undefined);
        });

        test('tracks awaited dynamic namespaces', function () {
            const graph = analyze({
                'index.js': 'export async function probe(){const ns=await import("./library.js");return ns.used;}',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.exported('library.js', 'unused'), new Set());
            assert.strictEqual(graph.exported('library.js', 'used'), undefined);
        });

        test('retains namespaces returned through import promises', function () {
            const graph = analyze({
                'index.js': 'export function probe(){return import("./library.js");}',
                'library.js': library
            }, [ 'index.js' ]);
            assert.strictEqual(graph.exported('library.js', 'unused'), undefined);
        });

        test('retains a namespace whose public binding escapes', function () {
            const graph = analyze({
                'index.js': 'import * as ns from "./library.js";export const escaped=ns;',
                'library.js': library
            }, [ 'index.js' ]);
            assert.strictEqual(graph.properties('index.js', 'ns'), undefined);
        });

        test('keeps unknown dynamic imports conservative', function () {
            const graph = analyze({
                'index.js': 'export function probe(path){return import(path);}',
                'library.js': library
            }, [ 'index.js' ]);
            assert.strictEqual(graph.exported('library.js', 'used'), undefined);
        });

        test('keeps direct eval conservative', function () {
            const graph = analyze({
                'index.js': 'import * as ns from "./library.js";export function probe(){return eval("ns.used");}',
                'library.js': library
            }, [ 'index.js' ]);
            assert.strictEqual(graph.properties('index.js', 'ns'), undefined);
        });
    });

    suite('syntax and graph boundaries', function () {
        test('follows namespace imports and reexports without aliases', function () {
            const graph = analyze({
                'index.js': 'import {ns} from "./forward.js";export function probe(){return ns.used;}',
                'forward.js': 'export {ns} from "./wrapper.js";',
                'wrapper.js': 'import * as ns from "./library.js";export {ns};',
                'library.js': library
            }, [ 'index.js' ]);
            assert.deepStrictEqual(graph.properties('index.js', 'ns'), new Set([ 'used' ]));
            assert.deepStrictEqual(graph.exported('wrapper.js', 'ns'), new Set([ 'used' ]));
            assert.deepStrictEqual(graph.properties('wrapper.js', 'ns'), new Set([ 'used' ]));
        });
        for (const declaration of [ 'let key="used";', 'function key(){return "used";}', 'const key=select();' ]) {
            test(`keeps unresolved computed keys conservative for ${declaration}`, function () {
                const graph = analyze({
                    'index.js':
                        `import * as ns from "./library.js";${declaration}export function probe(){return ns[key];}`,
                    'library.js': library
                }, [ 'index.js' ]);
                assert.strictEqual(graph.properties('index.js', 'ns'), undefined);
            });
        }

        test('rejects declarations that do not bind namespace values', function () {
            const graph = analyze({ 'index.js': 'export function factory(){return 42;}' }, [ 'index.js' ]);
            assert.strictEqual(graph.properties('index.js', 'factory'), undefined);
        });
        for (const statement of [ 'import "./library.js";', 'export {} from "./library.js";' ]) {
            test(`does not observe export values through ${statement}`, function () {
                const graph = analyze({ 'index.js': statement, 'library.js': library }, [ 'index.js' ]);
                assert.deepStrictEqual(graph.exported('library.js', 'used'), new Set());
            });
        }
        for (const expression of [ '((ns as any)!).used', '(ns satisfies object).used', '(<any>ns).used' ]) {
            test(`tracks transparent TypeScript wrappers in ${expression}`, function () {
                const graph = analyze({
                    'index.ts': `import * as ns from "./library.js";export function probe(){return ${expression};}`,
                    'library.js': library
                }, [ 'index.ts' ]);
                assert.deepStrictEqual(graph.properties('index.ts', 'ns'), new Set([ 'used' ]));
            });
        }

        test('keeps foreign consumers outside the analyzed files conservative', function () {
            const fixture = createExportModuleFixture({
                'producer.js': 'import * as ns from "./library.js";export const alias=ns;',
                'outside.js': 'import {alias} from "./producer.js";export function probe(){return alias.used;}',
                'library.js': library
            }, []);
            const analysis = createNamespaceDemandAnalysis(
                fixture.sources.filter(function (source) {
                    return source !== fixture.source('outside.js');
                }),
                new Set(),
                fixture.resolveModule,
                conservativeReceivers
            );
            const declaration = fixture.models.get(fixture.source('producer.js'))?.locals.get('ns')?.declarationNode;
            assertDefined(declaration);
            assert.strictEqual(analysis.properties(declaration), undefined);
            assert.strictEqual(analysis.exportProperties(fixture.source('outside.js'), 'alias'), undefined);
        });
    });
});

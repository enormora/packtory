import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { collectCandidateExportNames, type CandidateExportNames } from './candidate-export-names.ts';

type CandidateObservation = { readonly names: readonly string[] | undefined; readonly opaque: boolean; };
type CandidateGraph = { readonly read: (name: string) => CandidateObservation; };

function graphFor(files: Readonly<Record<string, string>>, omitted: readonly string[]): CandidateGraph {
    const fixture = createExportModuleFixture(files, omitted);
    const result: CandidateExportNames = collectCandidateExportNames(
        Array.from(fixture.models.values()),
        fixture.resolveModule
    );
    return {
        read(name) {
            const source = fixture.source(name);
            const names = result.names.get(source);
            return {
                names: names === undefined ? undefined : Array.from(names).toSorted(function (left, right) {
                    return left.localeCompare(right);
                }),
                opaque: result.opaque.has(source)
            };
        }
    };
}

suite('candidate export names', function () {
    test('inherits star names without forwarding the dependency default', function () {
        const graph = graphFor({
            'index.js': 'export * from "./library.js";export const own=1;',
            'library.js': 'export const value=42;export default 1;'
        }, []);
        assert.deepStrictEqual(graph.read('index.js'), { names: [ 'own', 'value' ], opaque: false });
        assert.deepStrictEqual(graph.read('library.js'), { names: [ 'default', 'value' ], opaque: false });
    });

    test('keeps conflicting names as candidates until binding resolution', function () {
        const graph = graphFor({
            'index.js': 'export * from "./first.js";export * from "./second.js";',
            'first.js': 'export const value=1;',
            'second.js': 'export const value=2;'
        }, []);
        assert.deepStrictEqual(graph.read('index.js'), { names: [ 'value' ], opaque: false });
    });

    test('records explicit forwarded and namespace names without exposing target members', function () {
        const graph = graphFor({
            'index.js': 'export {value as renamed} from "./library.js";export * as grouped from "./library.js";',
            'library.js': 'export const value=42;export const hidden=1;'
        }, []);
        assert.deepStrictEqual(graph.read('index.js'), { names: [ 'grouped', 'renamed' ], opaque: false });
    });

    test('does not follow an empty export clause as a star edge', function () {
        const graph = graphFor({
            'index.js': 'export {} from "./library.js";',
            'library.js': 'export const hidden=42;'
        }, []);
        assert.deepStrictEqual(graph.read('index.js'), { names: [], opaque: false });
    });

    test('propagates opacity through cycles while retaining known candidate names', function () {
        const graph = graphFor({
            'index.js': 'export * from "./cycle.js";export const known=1;',
            'cycle.js': 'export * from "./index.js";export * from "./external.js";'
        }, []);
        assert.deepStrictEqual(graph.read('index.js'), { names: [ 'known' ], opaque: true });
        assert.deepStrictEqual(graph.read('cycle.js'), { names: [ 'known' ], opaque: true });
    });

    test('treats a resolved source outside the supplied models as opaque', function () {
        const graph = graphFor({
            'index.js': 'export * from "./library.js";',
            'library.js': 'export const hidden=42;'
        }, [ 'library.js' ]);
        assert.deepStrictEqual(graph.read('index.js'), { names: [], opaque: true });
        assert.deepStrictEqual(graph.read('library.js'), { names: undefined, opaque: false });
    });

    test('propagates opaque schemas of modeled dependencies', function () {
        const graph = graphFor({
            'index.js': 'export * from "./library.js";',
            'library.js': 'const hidden=42;'
        }, []);
        assert.deepStrictEqual(graph.read('index.js'), { names: [], opaque: true });
    });

    test('settles a large cyclic graph without a depth or round cutoff', function () {
        const count = 128;
        const files = Object.fromEntries(Array.from({ length: count }, function (_value, index) {
            return [
                `module${index}.js`,
                `export * from "./module${(index + 1) % count}.js";export const name${index}=1;export default ${index};`
            ];
        }));
        const graph = graphFor(files, []);
        const names = [
            'default',
            ...Array.from({ length: count }, function (_value, index) {
                return `name${index}`;
            })
        ]
            .toSorted(function (left, right) {
                return left.localeCompare(right);
            });
        assert.deepStrictEqual(graph.read('module0.js'), { names, opaque: false });
        assert.deepStrictEqual(graph.read(`module${count - 1}.js`), { names, opaque: false });
    });
});

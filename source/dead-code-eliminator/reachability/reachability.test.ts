import assert from 'node:assert';
import { suite, test } from 'mocha';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import {
    assertLocalValueExportIsReachable,
    assertReExportTargetIsReachable,
    fileBindingsFor,
    multiFileBindingsFor,
    reachabilityForLocalValueExport,
    reachabilityForReExportTarget
} from '../../test-libraries/reachability-test-support.ts';
import { bindingIdentifier } from './binding-identifier.ts';
import { buildReachabilityIndex, type ReachabilityInput } from './reachability.ts';

function reachabilityInput(
    files: ReachabilityInput['files'],
    entryPointFilePaths: ReachabilityInput['entryPointFilePaths']
): ReachabilityInput {
    return {
        bundleName: 'package',
        files,
        entryPointFilePaths,
        classifySideEffects,
        trace: undefined
    };
}

suite('reachability', function () {
    test('classifies each source once while resolving local and external bindings', function () {
        const files = [ fileBindingsFor('entry.ts', 'export const publicValue=42;const privateValue=1;') ];
        let classifications = 0;
        const index = buildReachabilityIndex({
            ...reachabilityInput(files, new Set([ 'entry.ts' ])),
            classifySideEffects(source) {
                classifications += 1;
                return classifySideEffects(source);
            }
        });
        assert.deepStrictEqual(index.localReachable, new Set([ 'entry.ts::publicValue' ]));
        const expanded = index.resolveWith(new Set([ 'entry.ts::privateValue' ]));
        assert.deepStrictEqual(expanded.bindings, new Set([ 'entry.ts::publicValue', 'entry.ts::privateValue' ]));
        assert.deepStrictEqual(expanded.exports.get('entry.ts'), new Set([ 'publicValue' ]));
        assert.strictEqual(classifications, 1);
    });

    suite('entry-point and local binding reachability', function () {
        test('keeps every exported entry-point binding reachable', function () {
            const files = [ fileBindingsFor('entry.ts', 'export function pub() {}\nexport class Pub {}') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'pub')));
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'Pub')));
        });

        test('does not keep an unexported and unused helper reachable', function () {
            const files = [ fileBindingsFor('entry.ts', 'function helper() {}\nexport function pub() { return 1; }') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.strictEqual(index.localReachable.has(bindingIdentifier('entry.ts', 'helper')), false);
        });

        test('keeps an unexported helper reachable when an exported binding references it', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'function helper() { return 1; }\nexport function pub() { return helper(); }'
                )
            ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'helper')));
        });

        test('keeps the whole destructuring declarator reachable when an exported binding references one of its bindings', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'const { helper, other } = { helper() { return 1; }, other() { return 2; } };\nexport function pub() { return helper(); }'
                )
            ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'helper')));
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'other')));
        });

        test('keeps a destructuring initializer reachable when an exported destructured binding is live', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'function createApi() { return { publish() { return 1; } }; }\nconst api = createApi();\nexport const { publish } = api;'
                )
            ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'publish')));
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'api')));
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'createApi')));
        });

        test('keeps shorthand property value bindings reachable when an exported object literal uses them', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'const globalSchema = 1;\nconst perPackageSchema = 2;\nfunction run() { return 3; }\nexport const rule = { globalSchema, perPackageSchema, run };'
                )
            ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'rule')));
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'globalSchema')));
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'perPackageSchema')));
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'run')));
        });

        test('ignores shorthand properties whose value symbol cannot be resolved', function () {
            const files = [ fileBindingsFor('entry.ts', 'export const rule = { missing };') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'rule')));
            assert.strictEqual(index.localReachable.has(bindingIdentifier('entry.ts', 'missing')), false);
        });

        test('keeps cross-file imports reachable when an entry-point uses them', function () {
            const files = multiFileBindingsFor([
                {
                    filePath: 'entry.ts',
                    content: 'import { used } from "./helpers.ts";\nexport function pub() { return used(); }'
                },
                {
                    filePath: 'helpers.ts',
                    content: 'export function used() { return 1; }\nexport function unused() { return 2; }'
                }
            ]);
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('helpers.ts', 'used')));
            assert.strictEqual(index.localReachable.has(bindingIdentifier('helpers.ts', 'unused')), false);
        });
    });

    suite('export lists and transitive references', function () {
        test('keeps a named re-export target from an entry point reachable', function () {
            const index = reachabilityForReExportTarget('export { used } from "./target.ts";');

            assertReExportTargetIsReachable(index);
        });

        test('keeps an aliased named re-export target from an entry point reachable', function () {
            const index = reachabilityForReExportTarget('export { used as renamed } from "./target.ts";');

            assertReExportTargetIsReachable(index);
            assert.strictEqual(index.localReachable.has(bindingIdentifier('entry.ts', 'renamed')), false);
        });

        test('does not keep a named re-export target from a non-entry file reachable', function () {
            const files = multiFileBindingsFor([
                {
                    filePath: 'entry.ts',
                    content: ''
                },
                {
                    filePath: 'internal.ts',
                    content: 'export { usedValue } from "./values.ts";'
                },
                {
                    filePath: 'values.ts',
                    content: 'export const usedValue = 1;'
                }
            ]);
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.strictEqual(index.localReachable.has(bindingIdentifier('values.ts', 'usedValue')), false);
        });

        test('keeps a local binding exported through an entry-point export list reachable', function () {
            const index = reachabilityForLocalValueExport('export { localValue };');

            assertLocalValueExportIsReachable(index);
        });

        test('keeps a local binding exported through an aliased entry-point export list reachable', function () {
            const index = reachabilityForLocalValueExport('export { localValue as publicValue };');

            assertLocalValueExportIsReachable(index);
            assert.strictEqual(index.localReachable.has(bindingIdentifier('entry.ts', 'publicValue')), false);
        });

        test('keeps every binding reachable that an impure top-level statement references', function () {
            const files = [ fileBindingsFor('entry.ts', 'function setup() {}\nfunction unused() {}\nsetup();') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'setup')));
            assert.strictEqual(index.localReachable.has(bindingIdentifier('entry.ts', 'unused')), false);
        });

        test('preserves helpers transitively reached through internal calls', function () {
            const content = [
                'function deep() { return 1; }',
                'function middle() { return deep(); }',
                'export function top() { return middle(); }'
            ]
                .join('\n');
            const files = [ fileBindingsFor('entry.ts', content) ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'deep')));
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'middle')));
        });

        test('expandWith honours external seeds passed in by callers', function () {
            const files = [ fileBindingsFor('lib.ts', 'export function used() {}\nexport function unused() {}') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set<string>()));
            const reachable = index.expandWith(new Set([ bindingIdentifier('lib.ts', 'used') ]));

            assert.ok(reachable.has(bindingIdentifier('lib.ts', 'used')));
            assert.strictEqual(reachable.has(bindingIdentifier('lib.ts', 'unused')), false);
        });
    });

    suite('external seeds and traversal state', function () {
        test('returns no reachable bindings when no entry points and no external seeds are given', function () {
            const files = [ fileBindingsFor('lib.ts', 'export function isolated() {}') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set<string>()));

            assert.strictEqual(index.localReachable.size, 0);
        });

        test('expandWith tolerates external seeds that do not exist in the bundle edge map', function () {
            const files = [ fileBindingsFor('lib.ts', 'export function used() {}') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set<string>()));
            const reachable = index.expandWith(new Set([ bindingIdentifier('not-in-bundle.ts', 'mystery') ]));

            assert.ok(reachable.has(bindingIdentifier('not-in-bundle.ts', 'mystery')));
            assert.strictEqual(reachable.size, 1);
        });

        test('expandWith returns the localReachable set unchanged when given no external seeds', function () {
            const files = [ fileBindingsFor('entry.ts', 'export function pub() { return 1; }') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.strictEqual(index.expandWith(undefined), index.localReachable);
            assert.strictEqual(index.expandWith(new Set<string>()), index.localReachable);
        });

        test('expandWith preserves localReachable bindings that the external seeds do not transitively reach', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'export function pub() { return 1; }\nexport function other() { return 2; }'
                )
            ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));
            const reachable = index.expandWith(new Set([ bindingIdentifier('entry.ts', 'pub') ]));

            assert.ok(reachable.has(bindingIdentifier('entry.ts', 'pub')));
            assert.ok(reachable.has(bindingIdentifier('entry.ts', 'other')));
        });

        test('expandWith reuses the injected visitedHas dependency', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'function helper() { return pub(); }\nexport function pub() { return helper(); }'
                )
            ];
            let bindingChecks = 0;
            const index = buildReachabilityIndex(
                reachabilityInput(files, new Set<string>()),
                {
                    visitedHas(visited, value) {
                        if (typeof value === 'string' && value.includes('::')) {
                            assert.ok(bindingChecks < 100, 'Binding traversal must remain bounded');
                            bindingChecks += 1;
                            return false;
                        }
                        return visited.has(value);
                    }
                }
            );

            assert.throws(function () {
                index.expandWith(new Set([ bindingIdentifier('entry.ts', 'pub') ]));
            }, /^Error: Reachability traversal exceeded 17 attempts$/u);
        });

        test('passes newly added edges to the injected traversal dependency', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'function helper() { return 1; }\nexport function pub() { return helper(); }'
                )
            ];
            const addedEdges: string[][] = [];
            buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])), {
                neighborAdded(fromBindingIdentifier, toBindingIdentifier) {
                    addedEdges.push([ fromBindingIdentifier, toBindingIdentifier ]);
                }
            });

            assert.deepStrictEqual(addedEdges, [
                [ bindingIdentifier('entry.ts', 'pub'), bindingIdentifier('entry.ts', 'helper') ]
            ]);
        });

        test('does not record any unresolved binding ids when a function references its own parameters', function () {
            const files = [ fileBindingsFor('entry.ts', 'export function pub(x: number) { return x; }') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])));

            assert.strictEqual(index.localReachable.size, 1);
            assert.ok(index.localReachable.has(bindingIdentifier('entry.ts', 'pub')));
        });

        test('includes every file in bindingIdentifiersByFile, even unreachable ones', function () {
            const files = [ fileBindingsFor('isolated.ts', 'export function never() {}') ];
            const index = buildReachabilityIndex(reachabilityInput(files, new Set<string>()));

            const isolatedIdentifiers = index.bindingIdentifiersByFile.get('isolated.ts');
            assertDefined(isolatedIdentifiers);
            assert.ok(isolatedIdentifiers.has(bindingIdentifier('isolated.ts', 'never')));
        });

        test('buildReachabilityIndex completes a cyclic binding graph with bounded traversal', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'function helper() { return pub(); }\nexport function pub() { return helper(); }'
                )
            ];
            let checks = 0;
            const index = buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])), {
                visitedHas(visited, value) {
                    checks += 1;
                    assert.ok(checks <= 10, 'Cyclic binding traversal must remain bounded');
                    return visited.has(value);
                }
            });

            assert.deepStrictEqual(
                Array.from(index.localReachable).toSorted(function (left, right) {
                    return left.localeCompare(right);
                }),
                [
                    'entry.ts::helper',
                    'entry.ts::pub'
                ]
            );
            assert.ok(checks > 0);
        });
    });

    suite('traversal safeguards', function () {
        test('buildReachabilityIndex throws when traversal exceeds the iteration budget', function () {
            const files = [
                fileBindingsFor(
                    'entry.ts',
                    'function helper() { return pub(); }\nexport function pub() { return helper(); }'
                )
            ];
            let bindingChecks = 0;
            const visitedHas = function <T>(visited: ReadonlySet<T>, value: T): boolean {
                if (typeof value === 'string' && value.includes('::')) {
                    assert.ok(bindingChecks < 100, 'Binding traversal must remain bounded');
                    bindingChecks += 1;
                    return false;
                }
                return visited.has(value);
            };

            assert.throws(function () {
                buildReachabilityIndex(reachabilityInput(files, new Set([ 'entry.ts' ])), { visitedHas });
            }, /^Error: Reachability traversal exceeded 19 attempts$/u);
        });
    });
});

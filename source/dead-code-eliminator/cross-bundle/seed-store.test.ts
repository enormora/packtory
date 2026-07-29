import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Project } from 'ts-morph';
import { linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { bindingId } from '../reachability/binding-id.ts';
import { extractTopLevelBindings } from '../reachability/binding-extractor.ts';
import type { FileBindings } from '../reachability/local-seed-gathering.ts';
import type { ResolvedTarget } from './bundle-index.ts';
import { createSeedStore, recordSeed, seedAllBindings } from './seed-store.ts';

suite('seed-store', function () {
    test('createSeedStore returns an empty seed map', function () {
        const store = createSeedStore();
        assert.strictEqual(store.size, 0);
    });

    test('recordSeed creates a new bundle entry on first insertion', function () {
        const store = createSeedStore();
        const updated = recordSeed(store, 'pkg-a', 'seed-1');
        assert.deepStrictEqual(Array.from(updated.get('pkg-a') ?? new Set()), [ 'seed-1' ]);
    });

    test('recordSeed appends to an existing bundle entry without replacing earlier seeds', function () {
        const store = createSeedStore();
        const withFirstSeed = recordSeed(store, 'pkg-a', 'seed-1');
        const withSecondSeed = recordSeed(withFirstSeed, 'pkg-a', 'seed-2');
        assert.deepStrictEqual(Array.from(withSecondSeed.get('pkg-a') ?? new Set()), [ 'seed-1', 'seed-2' ]);
    });

    test('recordSeed deduplicates identical seeds within the same bundle', function () {
        const store = createSeedStore();
        const withFirstSeed = recordSeed(store, 'pkg-a', 'seed-1');
        const withDuplicateSeed = recordSeed(withFirstSeed, 'pkg-a', 'seed-1');
        assert.strictEqual(withDuplicateSeed.get('pkg-a')?.size, 1);
    });

    test('recordSeed keeps seeds for different bundles isolated', function () {
        const store = createSeedStore();
        const withFirstBundle = recordSeed(store, 'pkg-a', 'seed-a');
        const withSecondBundle = recordSeed(withFirstBundle, 'pkg-b', 'seed-b');
        assert.deepStrictEqual(Array.from(withSecondBundle.get('pkg-a') ?? new Set()), [ 'seed-a' ]);
        assert.deepStrictEqual(Array.from(withSecondBundle.get('pkg-b') ?? new Set()), [ 'seed-b' ]);
    });

    function fileBindingsWithExports(exportedNames: readonly string[]): FileBindings {
        const sourceFilePath = '/b/helpers.ts';
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(
            sourceFilePath,
            exportedNames
                .map(function (name) {
                    return `export const ${name} = 1;`;
                })
                .join('\n')
        );
        return {
            sourceFilePath,
            sourceFile,
            bindings: extractTopLevelBindings(sourceFile)
        };
    }

    function targetWithBindings(exportedNames: readonly string[]): ResolvedTarget {
        const fileBindings = fileBindingsWithExports(exportedNames);
        return {
            bundleName: 'pkg-b',
            sourceFilePath: '/b/helpers.ts',
            indexedBundle: {
                bundle: linkedBundle({ name: 'pkg-b' }),
                bindingsByFilePath: new Map([
                    [
                        '/b/helpers.ts',
                        fileBindings
                    ]
                ])
            }
        };
    }

    test('seedAllBindings records one seed per binding of the resolved target file', function () {
        const store = createSeedStore();
        const updated = seedAllBindings(store, targetWithBindings([ 'a', 'b' ]));
        assert.deepStrictEqual(Array.from(updated.get('pkg-b') ?? new Set()), [
            bindingId('/b/helpers.ts', 'a'),
            bindingId('/b/helpers.ts', 'b')
        ]);
    });

    test('seedAllBindings does nothing when the resolved file has no bindings entry', function () {
        const store = createSeedStore();
        const target: ResolvedTarget = {
            bundleName: 'pkg-b',
            sourceFilePath: '/b/missing.ts',
            indexedBundle: {
                bundle: linkedBundle({ name: 'pkg-b' }),
                bindingsByFilePath: new Map()
            }
        };
        const updated = seedAllBindings(store, target);
        assert.strictEqual(updated.size, 0);
    });
});

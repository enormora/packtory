/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bindingId } from '../reachability/binding-id.ts';
import type { ResolvedTarget } from './bundle-index.ts';
import { createSeedStore, recordSeed, seedAllBindings } from './seed-store.ts';

suite('seed-store', function () {
    test('createSeedStore returns an empty mutable map', function () {
        const store = createSeedStore();
        assert.strictEqual(store.size, 0);
    });

    test('recordSeed creates a new bundle entry on first insertion', function () {
        const store = createSeedStore();
        recordSeed(store, 'pkg-a', 'seed-1');
        assert.deepStrictEqual(Array.from(store.get('pkg-a') ?? new Set()), ['seed-1']);
    });

    test('recordSeed appends to an existing bundle entry without replacing earlier seeds', function () {
        const store = createSeedStore();
        recordSeed(store, 'pkg-a', 'seed-1');
        recordSeed(store, 'pkg-a', 'seed-2');
        assert.deepStrictEqual(Array.from(store.get('pkg-a') ?? new Set()), ['seed-1', 'seed-2']);
    });

    test('recordSeed deduplicates identical seeds within the same bundle', function () {
        const store = createSeedStore();
        recordSeed(store, 'pkg-a', 'seed-1');
        recordSeed(store, 'pkg-a', 'seed-1');
        assert.strictEqual(store.get('pkg-a')?.size, 1);
    });

    test('recordSeed keeps seeds for different bundles isolated', function () {
        const store = createSeedStore();
        recordSeed(store, 'pkg-a', 'seed-a');
        recordSeed(store, 'pkg-b', 'seed-b');
        assert.deepStrictEqual(Array.from(store.get('pkg-a') ?? new Set()), ['seed-a']);
        assert.deepStrictEqual(Array.from(store.get('pkg-b') ?? new Set()), ['seed-b']);
    });

    function targetWithBindings(bindings: readonly { readonly name: string }[]): ResolvedTarget {
        return {
            bundleName: 'pkg-b',
            sourceFilePath: '/b/helpers.ts',
            indexedBundle: {
                bundle: { name: 'pkg-b' } as never,
                bindingsByFilePath: new Map([
                    [
                        '/b/helpers.ts',
                        {
                            sourceFilePath: '/b/helpers.ts',
                            sourceFile: undefined as never,
                            bindings
                        } as never
                    ]
                ])
            }
        };
    }

    test('seedAllBindings records one seed per binding of the resolved target file', function () {
        const store = createSeedStore();
        seedAllBindings(store, targetWithBindings([{ name: 'a' }, { name: 'b' }]));
        assert.deepStrictEqual(Array.from(store.get('pkg-b') ?? new Set()), [
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
                bundle: { name: 'pkg-b' } as never,
                bindingsByFilePath: new Map()
            }
        };
        seedAllBindings(store, target);
        assert.strictEqual(store.size, 0);
    });
});

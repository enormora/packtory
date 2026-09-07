import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createSeedStore, recordSeed } from './seed-store.ts';

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
});

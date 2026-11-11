import assert from 'node:assert';
import { suite, test } from 'mocha';
import { collectBindingDependencies } from './binding-dependencies.ts';

suite('binding dependency traversal', function () {
    test('reads a cyclic graph node once and returns its binding leaves', function () {
        let reads = 0;
        const nodes = new Map([ [ 'cycle', function () {
            reads += 1;
            assert.strictEqual(reads, 1);
            return [ 'cycle', 'leaf' ];
        } ] ]);
        assert.deepStrictEqual(collectBindingDependencies('cycle', nodes), [ 'leaf' ]);
        assert.strictEqual(reads, 1);
    });
});

import assert from 'node:assert';
import { runInNewContext } from 'node:vm';
import { suite, test } from 'mocha';
import { primitiveSource } from './primitive-source.ts';

suite('primitive source values', function () {
    for (
        const value of [
            undefined,
            null,
            false,
            true,
            '',
            'quote"\n',
            0,
            -0,
            42,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
            42n
        ]
    ) {
        test(`preserves ${typeof value} ${Object.is(value, -0) ? '-0' : String(value)} without depending on global value names`, function () {
            const source = primitiveSource({ value });
            const restored: unknown = runInNewContext(`(function(undefined,Infinity,NaN){return (${source});})(1,2,3)`);
            assert.strictEqual(Object.is(restored, value), true);
        });
    }
});

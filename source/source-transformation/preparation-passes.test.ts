import assert from 'node:assert';
import { suite, test } from 'mocha';
import { preparationPasses } from './source-preparation.ts';

suite('preparation convergence', function () {
    test('processes a stable source state once', function () {
        const preparation = { content: 'unchanged' };
        assert.deepStrictEqual(
            Array.from(preparationPasses(preparation, function () {
                return preparation.content;
            })),
            [ preparation ]
        );
    });

    test('stops when preparation returns to an earlier source state', function () {
        const preparation = { content: 'first' };
        const states: string[] = [];
        const passes = preparationPasses(preparation, function () {
            return preparation.content;
        });
        for (const pass of passes) {
            states.push(pass.content);
            assert.ok(states.length <= 2);
            pass.content = pass.content === 'first' ? 'second' : 'first';
        }
        assert.deepStrictEqual(states, [ 'first', 'second' ]);
    });

    test('bounds preparation that keeps producing new states', function () {
        const preparation = { changes: 0 };
        const passes = preparationPasses(preparation, function () {
            return String(preparation.changes);
        });
        for (const pass of passes) {
            pass.changes += 1;
            assert.ok(pass.changes <= 32);
        }
        assert.strictEqual(preparation.changes, 32);
    });
});

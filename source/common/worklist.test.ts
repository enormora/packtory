import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createWorklist } from './worklist.ts';

suite('worklist', function () {
    test('takeNext returns undefined for an empty worklist', function () {
        const worklist = createWorklist<number>([]);

        assert.strictEqual(worklist.takeNext(), undefined);
    });

    test('takeNext yields initial and scheduled items in order', function () {
        const worklist = createWorklist([1]);
        worklist.schedule(2);
        worklist.scheduleAll([3, 4]);

        assert.deepStrictEqual(
            [worklist.takeNext(), worklist.takeNext(), worklist.takeNext(), worklist.takeNext()],
            [1, 2, 3, 4]
        );
    });

    test('takeNext returns undefined once all items are consumed', function () {
        const worklist = createWorklist(['main']);
        worklist.schedule('worker');

        assert.strictEqual(worklist.takeNext(), 'main');
        assert.strictEqual(worklist.takeNext(), 'worker');
        assert.strictEqual(worklist.takeNext(), undefined);
    });

    test('schedule can add more work after the current queue is exhausted', function () {
        const worklist = createWorklist(['main']);

        assert.strictEqual(worklist.takeNext(), 'main');
        assert.strictEqual(worklist.takeNext(), undefined);

        worklist.schedule('late');

        assert.strictEqual(worklist.takeNext(), 'late');
    });
});

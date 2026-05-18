import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeClock } from '../test-libraries/fake-clock.ts';

suite('fake-clock', function () {
    test('createFakeClock() exposes the initial timestamp and advances with tick()', function () {
        const clock = createFakeClock({ initialTimestamp: 10 });

        assert.strictEqual(clock.getCurrentTimeInMilliseconds(), 10);
        clock.tick(15);
        assert.strictEqual(clock.getCurrentTimeInMilliseconds(), 25);
    });

    test('createFakeClock() runs due handlers in order when time advances', function () {
        const clock = createFakeClock();
        const calls: string[] = [];

        clock.setTimeout(() => {
            calls.push('late');
        }, 10);
        clock.setTimeout(() => {
            calls.push('early');
        }, 5);

        clock.tick(5);
        assert.deepStrictEqual(calls, ['early']);

        clock.tick(5);
        assert.deepStrictEqual(calls, ['early', 'late']);
    });

    test('createFakeClock() runs zero-delay handlers immediately', function () {
        const clock = createFakeClock();
        const calls: string[] = [];

        clock.setTimeout(
            (value: string) => {
                calls.push(value);
            },
            0,
            'now'
        );

        assert.deepStrictEqual(calls, ['now']);
    });

    test('createFakeClock() can clear scheduled handlers', function () {
        const clock = createFakeClock();
        const calls: string[] = [];
        const timeoutId = clock.setTimeout(() => {
            calls.push('should-not-run');
        }, 10);

        clock.clearTimeout(timeoutId);
        clock.tick(10);

        assert.deepStrictEqual(calls, []);
    });

    test('createFakeClock() returns sequential timeout identifiers', function () {
        const clock = createFakeClock();

        const firstTimeoutId = clock.setTimeout(() => {
            return undefined;
        }, 10);
        const secondTimeoutId = clock.setTimeout(() => {
            return undefined;
        }, 10);

        assert.strictEqual(firstTimeoutId, 0);
        assert.strictEqual(secondTimeoutId, 1);
    });

    test('createFakeClock() keeps returning increasing timeout identifiers after clearing timers', function () {
        const clock = createFakeClock();
        const firstTimeoutId = clock.setTimeout(() => {
            return undefined;
        }, 10);

        clock.clearTimeout(firstTimeoutId);

        const secondTimeoutId = clock.setTimeout(() => {
            return undefined;
        }, 10);

        assert.strictEqual(firstTimeoutId, 0);
        assert.strictEqual(secondTimeoutId, 1);
    });

    test('createFakeClock() rejects negative delays', function () {
        const clock = createFakeClock();

        assert.throws(() => {
            clock.setTimeout(() => {
                return undefined;
            }, -1);
        }, /^Error: Invalid delay -1, must be greater than or equal to 0$/u);
    });

    test('createFakeClock() rejects non-finite delays', function () {
        const clock = createFakeClock();

        assert.throws(() => {
            clock.setTimeout(() => {
                return undefined;
            }, Number.POSITIVE_INFINITY);
        }, /^TypeError: Invalid delay, must be a finite number$/u);
    });
});

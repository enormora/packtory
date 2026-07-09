import assert from 'node:assert';
import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';
import { suite, test } from 'mocha';
import { createClock } from './clock.ts';

suite('clock', function () {
    test('createClock() returns the current wall-clock time in milliseconds', function () {
        const clock = createClock();
        const before = Date.now();
        const currentTime = clock.getCurrentTimeInMilliseconds();
        const after = Date.now();

        assert.ok(currentTime >= before);
        assert.ok(currentTime <= after);
    });

    test('createClock() exposes the global timeout functions', function () {
        const clock = createClock();

        assert.partialDeepStrictEqual(clock, {
            setTimeout: setTimer,
            clearTimeout: clearTimer
        });
    });
});

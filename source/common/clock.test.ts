import assert from 'node:assert';
import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';
import { suite, test } from 'mocha';
import { createClock } from './clock.ts';

suite('clock', function () {
    test('provides the platform clock and timer functions', function () {
        assert.deepStrictEqual(createClock(), {
            getCurrentTimeInMilliseconds: Date.now,
            setTimeout: setTimer,
            clearTimeout: clearTimer
        });
    });
});

import assert from 'node:assert';
import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';
import { test } from 'mocha';
import { createClock } from './clock.ts';

test('createClock() returns the current wall-clock time in milliseconds', () => {
    const clock = createClock();
    const before = Date.now();
    const currentTime = clock.getCurrentTimeInMilliseconds();
    const after = Date.now();

    assert.ok(currentTime >= before);
    assert.ok(currentTime <= after);
});

test('createClock() exposes the global timeout functions', () => {
    const clock = createClock();

    assert.strictEqual(clock.setTimeout, setTimer);
    assert.strictEqual(clock.clearTimeout, clearTimer);
});

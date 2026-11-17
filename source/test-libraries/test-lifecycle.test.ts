import assert from 'node:assert';
import { Context, Test, suite, test } from 'mocha';
import { mochaHooks } from './test-lifecycle.ts';

suite('unit test resource cleanup', function () {
    test('releases completed callbacks that retain previous Mocha runs', function () {
        const context = new Context();
        const finish = function (): undefined {
            return undefined;
        };
        const completedTest = new Test('completed', finish);
        completedTest.callback = finish;
        context.currentTest = completedTest;
        const cleanup = mochaHooks.afterEach;
        if (typeof cleanup !== 'function') {
            assert.fail('Expected a single cleanup hook');
        }
        cleanup.call(context, finish);

        assert.strictEqual(completedTest.callback, undefined);
    });
});

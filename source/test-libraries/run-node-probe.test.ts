import assert from 'node:assert';
import { setTimeout as wait } from 'node:timers/promises';
import { suite, test } from 'mocha';
import { createNodeProbe, runNodeProbe } from './run-node-probe.ts';

type ControlledProbe = { readonly run: ReturnType<typeof createNodeProbe>; readonly stopped: boolean; };

function createControlledProbe(ready: Promise<void>, result: Promise<unknown>): ControlledProbe {
    let stopped = false;
    return {
        run: createNodeProbe(function () {
            return {
                ready,
                result,
                stop() {
                    stopped = true;
                }
            };
        }),
        get stopped() {
            return stopped;
        }
    };
}

suite('native Node probes', function () {
    test('reads JSON after the startup signal', async function () {
        assert.deepStrictEqual(await runNodeProbe('console.log(JSON.stringify({value:42,text:"hello"}));'), {
            value: 42,
            text: 'hello'
        });
    });

    test('supports static imports in the probe script', async function () {
        assert.strictEqual(
            await runNodeProbe(
                'import {basename} from "node:path";console.log(JSON.stringify(basename("folder/file")));'
            ),
            'file'
        );
    });

    test('rejects malformed JSON', async function () {
        await assert.rejects(runNodeProbe('console.log("invalid");'), SyntaxError);
    });

    test('preserves native process failures', async function () {
        await assert.rejects(runNodeProbe('throw new Error("native failure");'), /native failure/u);
    });

    test('terminates a nonterminating program after startup', async function () {
        await assert.rejects(runNodeProbe('while(true){}', { timeoutMilliseconds: 50 }), {
            message: 'Node probe execution timed out'
        });
    });

    test('keeps the execution budget available during startup', async function () {
        const ready = Promise.withResolvers<undefined>();
        const completed = Promise.withResolvers<unknown>();
        const probe = createControlledProbe(ready.promise, completed.promise);
        const observed = Promise.allSettled([
            probe.run('probe', { startupMilliseconds: 1000, executionMilliseconds: 25 })
        ]);
        await wait(75);
        assert.strictEqual(probe.stopped, false);
        ready.resolve(undefined);
        completed.resolve(42);
        assert.deepStrictEqual(await observed, [ { status: 'fulfilled', value: 42 } ]);
        assert.strictEqual(probe.stopped, true);
    });

    test('terminates a probe that cannot start within its startup budget', async function () {
        const probe = createControlledProbe(wait(100), wait(150, 42));
        await assert.rejects(probe.run('probe', { startupMilliseconds: 25, executionMilliseconds: 1000 }), {
            message: 'Node probe startup timed out'
        });
        assert.strictEqual(probe.stopped, true);
    });

    test('applies the execution budget after readiness', async function () {
        const probe = createControlledProbe(Promise.resolve(), wait(100, 42));
        await assert.rejects(probe.run('probe', { startupMilliseconds: 1000, executionMilliseconds: 25 }), {
            message: 'Node probe execution timed out'
        });
        assert.strictEqual(probe.stopped, true);
    });

    test('reports an early process failure without waiting for readiness', async function () {
        const ready = Promise.withResolvers<undefined>();
        const probe = createControlledProbe(ready.promise, Promise.reject(new Error('could not start')));
        await assert.rejects(probe.run('probe', { startupMilliseconds: 1000, executionMilliseconds: 25 }), {
            message: 'could not start'
        });
        assert.strictEqual(probe.stopped, true);
    });
});

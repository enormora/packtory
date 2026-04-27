import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import {
    createCommandLineInterfaceRunner,
    type CommandLineInterfaceRunner,
    type CommandLineInterfaceRunnerDependencies
} from './runner.ts';

type Overrides = {
    readonly buildAndPublishAll?: SinonSpy;
    readonly resolveAndLinkAll?: SinonSpy;
    readonly loadConfig?: SinonSpy;
    readonly log?: SinonSpy;
    progressBroadcaster?: ProgressBroadcaster;
    spinnerRenderer?: {
        add?: SinonSpy;
        stop?: SinonSpy;
        updateMessage?: SinonSpy;
        stopAll?: SinonSpy;
    };
};

function createSpy<TSpy extends SinonSpy>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

function createSpinnerRenderer(
    overrides: Overrides['spinnerRenderer'] = {}
): CommandLineInterfaceRunnerDependencies['spinnerRenderer'] {
    const add = createSpy(overrides.add, fake);
    const stop = createSpy(overrides.stop, fake);
    const updateMessage = createSpy(overrides.updateMessage, fake);
    const stopAll = createSpy(overrides.stopAll, fake);

    return {
        add: (...args) => {
            add(...args);
        },
        stop: (...args) => {
            stop(...args);
        },
        updateMessage: (...args) => {
            updateMessage(...args);
        },
        stopAll: () => {
            stopAll();
        }
    };
}

function runnerFactory(overrides: Overrides = {}): CommandLineInterfaceRunner {
    const progressBroadcaster = overrides.progressBroadcaster ?? createProgressBroadcaster();
    const log = createSpy(overrides.log, fake);
    const dependencies: CommandLineInterfaceRunnerDependencies = {
        packtory: {
            buildAndPublishAll: createSpy(overrides.buildAndPublishAll, () => {
                return fake.resolves(undefined);
            }),
            resolveAndLinkAll: createSpy(overrides.resolveAndLinkAll, () => {
                return fake.resolves(Result.ok([]));
            })
        },
        log: (message) => {
            log(message);
        },
        configLoader: {
            load: createSpy(overrides.loadConfig, () => {
                return fake.resolves(undefined);
            })
        },
        progressBroadcaster: progressBroadcaster.consumer,
        spinnerRenderer: createSpinnerRenderer(overrides.spinnerRenderer)
    };

    return createCommandLineInterfaceRunner(dependencies);
}

test('publish command loads the config file and passes it to buildAndPublishAll()', async () => {
    const loadConfig = fake.resolves('the-config');
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ loadConfig, buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(loadConfig.callCount, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.strictEqual(buildAndPublishAll.firstCall.args[0], 'the-config');
});

test('publish command runs in dry-run mode per default', async () => {
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true });
});

test('publish command runs not in dry-run mode when no-dry-run flag is set', async () => {
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish', '--no-dry-run']);

    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: false });
});

test('returns exit code 0 when publish command had no errors', async () => {
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll });

    const exitCode = await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(exitCode, 0);
});

test('returns exit code 1 when publish command has errors', async () => {
    const buildAndPublishAll = fake.resolves(Result.err({ type: 'config', issues: [] }));
    const runner = runnerFactory({ buildAndPublishAll });

    const exitCode = await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(exitCode, 1);
});

test('returns exit code 1 instead of exiting the process when command parsing fails', async () => {
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll });

    const exitCode = await runner.run(['foo', 'bar', 'not-a-command']);

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 0);
});

test('rethrows the error when buildAndPublishAll() throws', async () => {
    const buildAndPublishAll = fake.rejects(new Error('foo'));
    const runner = runnerFactory({ buildAndPublishAll });

    try {
        await runner.run(['foo', 'bar', 'publish']);
        assert.fail('Expected run() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'foo');
    }
});

test('prints error summary when publish command encounters config errors', async () => {
    const buildAndPublishAll = fake.resolves(Result.err({ type: 'config', issues: ['foo'] }));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(log.callCount, 2);
    assert.deepStrictEqual(log.firstCall.args, ['✖ The provided config is invalid, there are 1 issue(s)\n\n- foo']);
});

test('prints error summary when publish command encounters check errors', async () => {
    const buildAndPublishAll = fake.resolves(Result.err({ type: 'checks', issues: ['foo'] }));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(log.callCount, 2);
    assert.deepStrictEqual(log.firstCall.args, ['✖ Checks failed, there are 1 issue(s)\n\n- foo']);
});

test('prints error summary and dry-run note when publish command encounters partial errors', async () => {
    const buildAndPublishAll = fake.resolves(
        Result.err({ type: 'partial', succeeded: ['foo'], failures: [new Error('first'), new Error('second')] })
    );
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(log.callCount, 2);
    assert.deepStrictEqual(log.firstCall.args, ['✖ 2 from 3 package(s) failed; 1 succeeded']);
    assert.deepStrictEqual(log.secondCall.args, [
        '⚠  Note: dry-run mode was enabled, so there was nothing really published; add the --no-dry-run flag to disable dry-run mode'
    ]);
});

test('prints error summary without dry-run note when publish command encounters partial errors and dry-run mode is disabled', async () => {
    const buildAndPublishAll = fake.resolves(
        Result.err({ type: 'partial', succeeded: ['foo'], failures: [new Error('first'), new Error('second')] })
    );
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish', '--no-dry-run']);

    assert.strictEqual(log.callCount, 1);
    assert.deepStrictEqual(log.firstCall.args, ['✖ 2 from 3 package(s) failed; 1 succeeded']);
});

test('prints success summary and dry-run note when publish command had no errors', async () => {
    const buildAndPublishAll = fake.resolves(Result.ok(['foo', 'bar']));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(log.callCount, 2);
    assert.deepStrictEqual(log.firstCall.args, ['✔ Success: all 2 package(s) have been published']);
    assert.deepStrictEqual(log.secondCall.args, [
        '⚠  Note: dry-run mode was enabled, so there was nothing really published; add the --no-dry-run flag to disable dry-run mode'
    ]);
});

test('prints success summary without dry-run note when publish command had no errors and dry-run mode is disabled', async () => {
    const buildAndPublishAll = fake.resolves(Result.ok(['foo', 'bar']));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish', '--no-dry-run']);

    assert.strictEqual(log.callCount, 1);
    assert.deepStrictEqual(log.firstCall.args, ['✔ Success: all 2 package(s) have been published']);
});

test('stops all spinners when buildAndPublishAll throws', async () => {
    const stopAll = fake();
    const buildAndPublishAll = fake.rejects(new Error('foo'));
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stopAll } });

    try {
        await runner.run(['foo', 'bar', 'publish']);
        assert.fail('Expected run() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'foo');
    }
    assert.strictEqual(stopAll.callCount, 1);
});

test('stops all spinners when buildAndPublishAll finishes without errors', async () => {
    const stopAll = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stopAll } });

    await runner.run(['foo', 'bar', 'publish']);
    assert.ok(stopAll.callCount >= 1);
});

test('adds a spinner when progressBroadcaster receives a "scheduled" event', async () => {
    const add = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { add }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('scheduled', { packageName: 'foo' });

    assert.strictEqual(add.callCount, 1);
    assert.deepStrictEqual(add.firstCall.args, ['foo', 'foo', 'Scheduled …']);
});

test('stops a running spinner with failure status when progressBroadcaster receives an "error" event', async () => {
    const stop = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stop }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('error', { packageName: 'foo', error: new Error('bar') });

    assert.strictEqual(stop.callCount, 1);
    assert.deepStrictEqual(stop.firstCall.args, ['foo', 'failure', 'bar']);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and already-published status', async () => {
    const stop = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stop }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('done', { packageName: 'foo', version: '1', status: 'already-published' });

    assert.strictEqual(stop.callCount, 1);
    assert.deepStrictEqual(stop.firstCall.args, [
        'foo',
        'success',
        'Nothing has changed, published version 1 is already up-to-date'
    ]);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and initial-version status', async () => {
    const stop = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stop }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('done', { packageName: 'foo', version: '1', status: 'initial-version' });

    assert.strictEqual(stop.callCount, 1);
    assert.deepStrictEqual(stop.firstCall.args, ['foo', 'success', 'First version 1 has been published']);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and new-version status', async () => {
    const stop = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stop }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('done', { packageName: 'foo', version: '1', status: 'new-version' });

    assert.strictEqual(stop.callCount, 1);
    assert.deepStrictEqual(stop.firstCall.args, ['foo', 'success', 'New version 1 published']);
});

test('updates a running spinner message when a "building" event is received', async () => {
    const updateMessage = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { updateMessage }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('building', { packageName: 'foo', version: '1' });

    assert.strictEqual(updateMessage.callCount, 1);
    assert.deepStrictEqual(updateMessage.firstCall.args, ['foo', 'Building package with version 1']);
});

test('updates a running spinner message when a "rebuilding" event is received', async () => {
    const updateMessage = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { updateMessage }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('rebuilding', { packageName: 'foo', version: '1' });

    assert.strictEqual(updateMessage.callCount, 1);
    assert.deepStrictEqual(updateMessage.firstCall.args, ['foo', 'Rebuilding package with version 1']);
});

import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.js';
import {
    createCommandLineInterfaceRunner,
    type CommandLineInterfaceRunner,
    type CommandLineInterfaceRunnerDependencies
} from './runner.js';

type Overrides = {
    readonly buildAndPublishAll?: SinonSpy;
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

// eslint-disable-next-line complexity -- needs to be refactored
function runnerFactory(overrides: Overrides = {}): CommandLineInterfaceRunner {
    const {
        buildAndPublishAll = fake.resolves(undefined),
        loadConfig = fake.resolves(undefined),
        log = fake(),
        progressBroadcaster = createProgressBroadcaster(),
        spinnerRenderer: { add = fake(), stop = fake(), updateMessage = fake(), stopAll = fake() } = {}
    } = overrides;
    const fakeDependencies = {
        packtory: { buildAndPublishAll },
        log,
        configLoader: { load: loadConfig },
        progressBroadcaster: progressBroadcaster.consumer,
        spinnerRenderer: { add, stop, updateMessage, stopAll }
    } as unknown as CommandLineInterfaceRunnerDependencies;

    return createCommandLineInterfaceRunner(fakeDependencies);
}

test('publish command loads the config file and passes it to buildAndPublishAll()', async (t) => {
    const loadConfig = fake.resolves('the-config');
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ loadConfig, buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish']);

    t.is(loadConfig.callCount, 1);
    t.is(buildAndPublishAll.callCount, 1);
    t.is(buildAndPublishAll.firstCall.args[0], 'the-config');
});

test('publish command runs in dry-run mode per default', async (t) => {
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish']);

    t.is(buildAndPublishAll.callCount, 1);
    t.deepEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true });
});

test('publish command runs not in dry-run mode when no-dry-run flag is set', async (t) => {
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish', '--no-dry-run']);

    t.is(buildAndPublishAll.callCount, 1);
    t.deepEqual(buildAndPublishAll.firstCall.args[1], { dryRun: false });
});

test('returns exit code 0 when publish command had no errors', async (t) => {
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll });

    const exitCode = await runner.run(['foo', 'bar', 'publish']);

    t.is(exitCode, 0);
});

test('returns exit code 1 when publish command has errors', async (t) => {
    const buildAndPublishAll = fake.resolves(Result.err({ type: 'config', issues: [] }));
    const runner = runnerFactory({ buildAndPublishAll });

    const exitCode = await runner.run(['foo', 'bar', 'publish']);

    t.is(exitCode, 1);
});

test('rethrows the error when buildAndPublishAll() throws', async (t) => {
    const buildAndPublishAll = fake.rejects(new Error('foo'));
    const runner = runnerFactory({ buildAndPublishAll });

    await t.throwsAsync(runner.run(['foo', 'bar', 'publish']), { message: 'foo' });
});

test('prints error summary when publish command encounters config errors', async (t) => {
    const buildAndPublishAll = fake.resolves(Result.err({ type: 'config', issues: ['foo'] }));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish']);

    t.is(log.callCount, 2);
    t.deepEqual(log.firstCall.args, ['✖ The provided config is invalid, there are 1 issue(s)\n\n- foo']);
});

test('prints error summary and dry-run note when publish command encounters partial errors', async (t) => {
    const buildAndPublishAll = fake.resolves(
        Result.err({ type: 'partial', succeeded: ['foo'], failures: [new Error('first'), new Error('second')] })
    );
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish']);

    t.is(log.callCount, 2);
    t.deepEqual(log.firstCall.args, ['✖ 2 from 3 package(s) failed; 1 succeeded']);
    t.deepEqual(log.secondCall.args, [
        '⚠  Note: dry-run mode was enabled, so there was nothing really published; add the --no-dry-run flag to disable dry-run mode'
    ]);
});

test('prints error summary without dry-run note when publish command encounters partial errors and dry-run mode is disabled', async (t) => {
    const buildAndPublishAll = fake.resolves(
        Result.err({ type: 'partial', succeeded: ['foo'], failures: [new Error('first'), new Error('second')] })
    );
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish', '--no-dry-run']);

    t.is(log.callCount, 1);
    t.deepEqual(log.firstCall.args, ['✖ 2 from 3 package(s) failed; 1 succeeded']);
});

test('prints success summary and dry-run note when publish command had no errors', async (t) => {
    const buildAndPublishAll = fake.resolves(Result.ok(['foo', 'bar']));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish']);

    t.is(log.callCount, 2);
    t.deepEqual(log.firstCall.args, ['✔ Success: all 2 package(s) have been published']);
    t.deepEqual(log.secondCall.args, [
        '⚠  Note: dry-run mode was enabled, so there was nothing really published; add the --no-dry-run flag to disable dry-run mode'
    ]);
});

test('prints success summary without dry-run note when publish command had no errors and dry-run mode is disabled', async (t) => {
    const buildAndPublishAll = fake.resolves(Result.ok(['foo', 'bar']));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish', '--no-dry-run']);

    t.is(log.callCount, 1);
    t.deepEqual(log.firstCall.args, ['✔ Success: all 2 package(s) have been published']);
});

test('stops all spinners when buildAndPublishAll throws', async (t) => {
    const stopAll = fake();
    const buildAndPublishAll = fake.rejects(new Error('foo'));
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stopAll } });

    await t.throwsAsync(runner.run(['foo', 'bar', 'publish']), { message: 'foo' });
    t.is(stopAll.callCount, 1);
});

test('stops all spinners when buildAndPublishAll finishes without errors', async (t) => {
    const stopAll = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stopAll } });

    await runner.run(['foo', 'bar', 'publish']);
    t.is(stopAll.callCount, 1);
});

test('adds a spinner when progressBroadcaster receives a "scheduled" event', async (t) => {
    const add = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { add }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('scheduled', { packageName: 'foo' });

    t.is(add.callCount, 1);
    t.deepEqual(add.firstCall.args, ['foo', 'foo', 'Scheduled …']);
});

test('stops a running spinner with failure status when progressBroadcaster receives an "error" event', async (t) => {
    const stop = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stop }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('error', { packageName: 'foo', error: new Error('bar') });

    t.is(stop.callCount, 1);
    t.deepEqual(stop.firstCall.args, ['foo', 'failure', 'bar']);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and already-published status', async (t) => {
    const stop = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stop }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('done', { packageName: 'foo', version: '1', status: 'already-published' });

    t.is(stop.callCount, 1);
    t.deepEqual(stop.firstCall.args, [
        'foo',
        'success',
        'Nothing has changed, published version 1 is already up-to-date'
    ]);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and initial-version status', async (t) => {
    const stop = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stop }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('done', { packageName: 'foo', version: '1', status: 'initial-version' });

    t.is(stop.callCount, 1);
    t.deepEqual(stop.firstCall.args, ['foo', 'success', 'First version 1 has been published']);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and new-version status', async (t) => {
    const stop = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stop }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('done', { packageName: 'foo', version: '1', status: 'new-version' });

    t.is(stop.callCount, 1);
    t.deepEqual(stop.firstCall.args, ['foo', 'success', 'New version 1 published']);
});

test('updates a running spinner message when a "building" event is received', async (t) => {
    const updateMessage = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { updateMessage }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('building', { packageName: 'foo', version: '1' });

    t.is(updateMessage.callCount, 1);
    t.deepEqual(updateMessage.firstCall.args, ['foo', 'Building package with version 1']);
});

test('updates a running spinner message when a "rebuilding" event is received', async (t) => {
    const updateMessage = fake();
    const buildAndPublishAll = fake.resolves(Result.ok([]));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { updateMessage }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('rebuilding', { packageName: 'foo', version: '1' });

    t.is(updateMessage.callCount, 1);
    t.deepEqual(updateMessage.firstCall.args, ['foo', 'Rebuilding package with version 1']);
});

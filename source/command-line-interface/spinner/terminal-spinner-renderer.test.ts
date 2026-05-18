import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import {
    createTerminalSpinnerRenderer,
    type SpinnerBackend,
    type TerminalSpinnerRenderer
} from './terminal-spinner-renderer.ts';

type BackendOverrides = {
    add?: SinonSpy;
    update?: SinonSpy;
    finish?: SinonSpy;
    shutdown?: SinonSpy;
};

function wrapVoid(spy: SinonSpy): (...args: unknown[]) => void {
    return (...args: unknown[]): void => {
        spy(...args);
    };
}

function createFakeBackend(overrides: BackendOverrides = {}): SpinnerBackend {
    const addSpy = overrides.add ?? fake();
    const updateSpy = overrides.update ?? fake();
    const finishSpy = overrides.finish ?? fake();
    const shutdownSpy = overrides.shutdown ?? fake();
    const backend: SpinnerBackend = {
        add: wrapVoid(addSpy),
        update: wrapVoid(updateSpy),
        finish: wrapVoid(finishSpy),
        shutdown: wrapVoid(shutdownSpy)
    };
    return backend;
}

function terminalSpinnerRendererFactory(backend: SpinnerBackend = createFakeBackend()): TerminalSpinnerRenderer {
    return createTerminalSpinnerRenderer({ backend });
}

test('add() forwards a new spinner to the backend at slot index zero', () => {
    const add = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ add }));

    renderer.add('the-id', 'the-label', 'the message');

    assert.strictEqual(add.callCount, 1);
    assert.deepStrictEqual(add.firstCall.args, [0, 'the-label', 'the message']);
});

test('add() assigns successive spinners to consecutive slot indices', () => {
    const add = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ add }));

    renderer.add('first', 'a', '1');
    renderer.add('second', 'b', '2');

    assert.strictEqual(add.callCount, 2);
    assert.deepStrictEqual(add.firstCall.args, [0, 'a', '1']);
    assert.deepStrictEqual(add.secondCall.args, [1, 'b', '2']);
});

test('add() throws when adding two spinners with the same id', () => {
    const renderer = terminalSpinnerRendererFactory();

    renderer.add('the-id', '', '');

    try {
        renderer.add('the-id', '', '');
        assert.fail('Expected add() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Spinner with id the-id already exists');
    }
});

test('updateMessage() forwards the new message to the backend with the spinner slot index', () => {
    const update = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ update }));

    renderer.add('the-id', 'lbl', 'initial');
    renderer.updateMessage('the-id', 'foo');

    assert.strictEqual(update.callCount, 1);
    assert.deepStrictEqual(update.firstCall.args, [0, 'lbl', 'foo']);
});

test('updateMessage() updates the correct spinner when having multiple', () => {
    const update = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ update }));

    renderer.add('first', 'one', '');
    renderer.add('second', 'two', '');
    renderer.updateMessage('first', 'foo');
    renderer.updateMessage('second', 'bar');

    assert.strictEqual(update.callCount, 2);
    assert.deepStrictEqual(update.firstCall.args, [0, 'one', 'foo']);
    assert.deepStrictEqual(update.secondCall.args, [1, 'two', 'bar']);
});

test('updateMessage() throws when trying to change the message of a non-existing spinner', () => {
    const renderer = terminalSpinnerRendererFactory();

    try {
        renderer.updateMessage('the-id', '');
        assert.fail('Expected updateMessage() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Spinner with id the-id does not exist');
    }
});

test('stop() finishes the spinner with succeeded state when the status is success', () => {
    const finish = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ finish }));

    renderer.add('the-id', 'lbl', '');
    renderer.stop('the-id', 'success', 'foo');

    assert.strictEqual(finish.callCount, 1);
    assert.deepStrictEqual(finish.firstCall.args, [0, 'succeeded', 'lbl', 'foo']);
});

test('stop() finishes the spinner with failed state when the status is failure', () => {
    const finish = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ finish }));

    renderer.add('the-id', 'lbl', '');
    renderer.stop('the-id', 'failure', 'foo');

    assert.strictEqual(finish.callCount, 1);
    assert.deepStrictEqual(finish.firstCall.args, [0, 'failed', 'lbl', 'foo']);
});

test('stop() keeps the stopped spinner addressable for later message updates', () => {
    const update = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ update }));

    renderer.add('the-id', 'lbl', '');
    renderer.stop('the-id', 'success', 'foo');
    renderer.updateMessage('the-id', 'updated');

    assert.strictEqual(update.callCount, 1);
    assert.deepStrictEqual(update.firstCall.args, [0, 'lbl', 'updated']);
});

test('stop() finishes only the targeted spinner when having multiple', () => {
    const finish = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ finish }));

    renderer.add('first', 'a', '');
    renderer.add('second', 'b', '');
    renderer.stop('first', 'failure', 'foo');
    renderer.stop('second', 'failure', 'bar');

    assert.strictEqual(finish.callCount, 2);
    assert.deepStrictEqual(finish.firstCall.args, [0, 'failed', 'a', 'foo']);
    assert.deepStrictEqual(finish.secondCall.args, [1, 'failed', 'b', 'bar']);
});

test('stop() throws when trying to stop a spinner that does not exist', () => {
    const renderer = terminalSpinnerRendererFactory();

    try {
        renderer.stop('the-id', 'failure', '');
        assert.fail('Expected stop() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Spinner with id the-id does not exist');
    }
});

test('stopAll() shuts down the backend', () => {
    const shutdown = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ shutdown }));

    renderer.add('first', '', '');
    renderer.stopAll();

    assert.strictEqual(shutdown.callCount, 1);
});

test('stopAll() cancels all spinners that are still running', () => {
    const finish = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ finish }));

    renderer.add('first', 'one', '');
    renderer.add('second', 'two', '');
    renderer.stop('first', 'success', 'foo');
    renderer.stopAll();

    assert.strictEqual(finish.callCount, 2);
    assert.deepStrictEqual(finish.firstCall.args, [0, 'succeeded', 'one', 'foo']);
    assert.deepStrictEqual(finish.secondCall.args, [1, 'canceled', 'two', 'Canceled …']);
});

test('stopAll() does not re-cancel previously canceled spinners on a second invocation', () => {
    const finish = fake();
    const shutdown = fake();
    const renderer = terminalSpinnerRendererFactory(createFakeBackend({ finish, shutdown }));

    renderer.add('only', 'lbl', '');
    renderer.stopAll();
    renderer.stopAll();

    assert.strictEqual(finish.callCount, 1);
    assert.strictEqual(shutdown.callCount, 2);
});

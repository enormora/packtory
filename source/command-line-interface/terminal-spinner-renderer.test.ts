import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import {
    createTerminalSpinnerRenderer,
    type TerminalSpinnerRenderer,
    type TerminalSpinnerRendererDependencies
} from './terminal-spinner-renderer.ts';

type SpinnerOverrides = {
    start?: SinonSpy;
    failed?: SinonSpy;
    succeed?: SinonSpy;
    reset?: SinonSpy;
};

type FakeSpinnerInstance = { start: SinonSpy; failed: SinonSpy; succeed: SinonSpy; text?: string; started?: boolean };
type FakeSpinnerClass = SinonSpy<unknown[], FakeSpinnerInstance> & { reset: SinonSpy };

function createFakeSpinnerClass(overrides: SpinnerOverrides = {}): FakeSpinnerClass {
    const { start = fake(), failed = fake(), succeed = fake(), reset = fake() } = overrides;
    const spinnerClass: FakeSpinnerClass = fake<unknown[], FakeSpinnerInstance>(() => {
        return {
            start,
            failed,
            succeed
        };
    }) as FakeSpinnerClass;
    spinnerClass.reset = reset;

    return spinnerClass;
}

type Overrides = {
    SpinnerClass?: FakeSpinnerClass;
};

function terminalSpinnerRendererFactory(overrides: Overrides = {}): TerminalSpinnerRenderer {
    const { SpinnerClass = createFakeSpinnerClass() } = overrides;
    return createTerminalSpinnerRenderer({ SpinnerClass } as unknown as TerminalSpinnerRendererDependencies);
}

test('add() creates a new spinner and starts that spinner directly', () => {
    const start = fake();
    const SpinnerClass = createFakeSpinnerClass({ start });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', 'the-label', 'the message');

    assert.strictEqual(SpinnerClass.callCount, 1);
    assert.strictEqual(SpinnerClass.calledWithNew(), true);
    assert.deepStrictEqual(SpinnerClass.firstCall.args, [{ name: 'dots' }]);
    assert.strictEqual(start.callCount, 1);
    assert.deepStrictEqual(start.firstCall.args, ['the message', { withPrefix: 'the-label: ' }]);
});

test('add() throws when adding two spinners with the same id', () => {
    const start = fake();
    const SpinnerClass = createFakeSpinnerClass({ start });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');

    try {
        renderer.add('the-id', '', '');
        assert.fail('Expected add() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Spinner with id the-id already exists');
    }
});

test('updateMessage() replaces the text of the spinner with the given id', () => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');
    renderer.updateMessage('the-id', 'foo');

    assert.strictEqual(SpinnerClass.firstCall.returnValue.text, 'foo');
});

test('updateMessage() replaces the text of the correct spinner when having multiple', () => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('first', '', '');
    renderer.add('second', '', '');
    renderer.updateMessage('first', 'foo');
    renderer.updateMessage('second', 'bar');

    assert.strictEqual(SpinnerClass.firstCall.returnValue.text, 'foo');
    assert.strictEqual(SpinnerClass.secondCall.returnValue.text, 'bar');
});

test('updateMessage() throws when trying to change the message of a non-existing spinner', () => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    try {
        renderer.updateMessage('the-id', '');
        assert.fail('Expected updateMessage() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Spinner with id the-id does not exist');
    }
});

test('stop() stops the spinner with the given id with success status and the given message', () => {
    const succeed = fake();
    const SpinnerClass = createFakeSpinnerClass({ succeed });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');
    renderer.stop('the-id', 'success', 'foo');

    assert.strictEqual(succeed.callCount, 1);
    assert.deepStrictEqual(succeed.firstCall.args, ['foo']);
});

test('stop() stops the spinner with the given id with failure status and the given message', () => {
    const failed = fake();
    const SpinnerClass = createFakeSpinnerClass({ failed });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');
    renderer.stop('the-id', 'failure', 'foo');

    assert.strictEqual(failed.callCount, 1);
    assert.deepStrictEqual(failed.firstCall.args, ['foo']);
});

test('stop() keeps the stopped spinner instance addressable for later updates', () => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');
    renderer.stop('the-id', 'success', 'foo');
    renderer.updateMessage('the-id', 'updated');

    assert.strictEqual(SpinnerClass.firstCall.returnValue.text, 'updated');
});

test('stop() stops only the correct corresponding spinners when having multiple', () => {
    const failed = fake();
    const SpinnerClass = createFakeSpinnerClass({ failed });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('first', '', '');
    renderer.add('second', '', '');
    renderer.stop('first', 'failure', 'foo');
    renderer.stop('second', 'failure', 'bar');

    assert.strictEqual(failed.callCount, 2);
    assert.deepStrictEqual(failed.firstCall.args, ['foo']);
    assert.deepStrictEqual(failed.secondCall.args, ['bar']);
});

test('stop() throws when trying to stop a spinner that does not exist', () => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    try {
        renderer.stop('the-id', 'failure', '');
        assert.fail('Expected stop() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Spinner with id the-id does not exist');
    }
});

test('stopAll() resets all spinners', () => {
    const reset = fake();
    const SpinnerClass = createFakeSpinnerClass({ reset });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('first', '', '');
    renderer.stopAll();

    assert.strictEqual(reset.callCount, 1);
    assert.deepStrictEqual(reset.firstCall.args, []);
});

test('stopAll() stops all spinners that are still running', () => {
    const failed = fake();
    const SpinnerClass = createFakeSpinnerClass({ failed });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('first', '', '');
    renderer.add('second', '', '');
    renderer.stop('first', 'success', 'foo');
    renderer.stopAll();

    assert.strictEqual(failed.callCount, 1);
    assert.deepStrictEqual(failed.firstCall.args, ['Canceled …']);
});

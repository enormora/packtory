import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import {
    createTerminalSpinnerRenderer,
    type TerminalSpinnerRenderer,
    type TerminalSpinnerRendererDependencies
} from './terminal-spinner-renderer.js';

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

test('add() creates a new spinner and starts that spinner directly', (t) => {
    const start = fake();
    const SpinnerClass = createFakeSpinnerClass({ start });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', 'the-label', 'the message');

    t.is(SpinnerClass.callCount, 1);
    t.is(SpinnerClass.calledWithNew(), true);
    t.deepEqual(SpinnerClass.firstCall.args, [{ name: 'dots' }]);
    t.is(start.callCount, 1);
    t.deepEqual(start.firstCall.args, ['the message', { withPrefix: 'the-label: ' }]);
});

test('add() throws when adding two spinners with the same id', (t) => {
    const start = fake();
    const SpinnerClass = createFakeSpinnerClass({ start });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');

    t.throws(
        () => {
            renderer.add('the-id', '', '');
        },
        { message: 'Spinner with id the-id already exists' }
    );
});

test('updateMessage() replaces the text of the spinner with the given id', (t) => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');
    renderer.updateMessage('the-id', 'foo');

    t.is(SpinnerClass.firstCall.returnValue.text, 'foo');
});

test('updateMessage() replaces the text of the correct spinner when having multiple', (t) => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('first', '', '');
    renderer.add('second', '', '');
    renderer.updateMessage('first', 'foo');
    renderer.updateMessage('second', 'bar');

    t.is(SpinnerClass.firstCall.returnValue.text, 'foo');
    t.is(SpinnerClass.secondCall.returnValue.text, 'bar');
});

test('updateMessage() throws when trying to change the message of a non-existing spinner', (t) => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    t.throws(
        () => {
            renderer.updateMessage('the-id', '');
        },
        { message: 'Spinner with id the-id does not exist' }
    );
});

test('stop() stops the spinner with the given id with success status and the given message', (t) => {
    const succeed = fake();
    const SpinnerClass = createFakeSpinnerClass({ succeed });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');
    renderer.stop('the-id', 'success', 'foo');

    t.is(succeed.callCount, 1);
    t.deepEqual(succeed.firstCall.args, ['foo']);
});

test('stop() stops the spinner with the given id with failure status and the given message', (t) => {
    const failed = fake();
    const SpinnerClass = createFakeSpinnerClass({ failed });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('the-id', '', '');
    renderer.stop('the-id', 'failure', 'foo');

    t.is(failed.callCount, 1);
    t.deepEqual(failed.firstCall.args, ['foo']);
});

test('stop() stops only the correct corresponding spinners when having multiple', (t) => {
    const failed = fake();
    const SpinnerClass = createFakeSpinnerClass({ failed });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('first', '', '');
    renderer.add('second', '', '');
    renderer.stop('first', 'failure', 'foo');
    renderer.stop('second', 'failure', 'bar');

    t.is(failed.callCount, 2);
    t.deepEqual(failed.firstCall.args, ['foo']);
    t.deepEqual(failed.secondCall.args, ['bar']);
});

test('stop() throws when trying to stop a spinner that does not exist', (t) => {
    const SpinnerClass = createFakeSpinnerClass();
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    t.throws(
        () => {
            renderer.stop('the-id', 'failure', '');
        },
        { message: 'Spinner with id the-id does not exist' }
    );
});

test('stopAll() resets all spinners', (t) => {
    const reset = fake();
    const SpinnerClass = createFakeSpinnerClass({ reset });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('first', '', '');
    renderer.stopAll();

    t.is(reset.callCount, 1);
    t.deepEqual(reset.firstCall.args, []);
});

test('stopAll() stops all spinners that are still running', (t) => {
    const failed = fake();
    const SpinnerClass = createFakeSpinnerClass({ failed });
    const renderer = terminalSpinnerRendererFactory({ SpinnerClass });

    renderer.add('first', '', '');
    renderer.add('second', '', '');
    renderer.stop('first', 'success', 'foo');
    renderer.stopAll();

    t.is(failed.callCount, 1);
    t.deepEqual(failed.firstCall.args, ['Canceled …']);
});

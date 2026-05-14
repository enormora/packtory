import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { createFakeClock, type FakeClock } from '../test-libraries/fake-clock.ts';
import { withPromiseDeadline } from '../test-libraries/promise-with-deadline.ts';
import { createOneTimePasswordPrompt } from './one-time-password-prompt.ts';

async function expectFailure(action: () => Promise<unknown>, expectedError: RegExp): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        assert.match(String(error), expectedError);
    }
}

type Overrides = {
    readonly clock?: FakeClock;
    readonly isInteractiveTerminal?: () => boolean;
    readonly stopSpinner?: SinonSpy;
    readonly question?: Partial<SinonSpy> & (() => Promise<string>);
    readonly close?: SinonSpy;
};

function createPrompt(overrides: Overrides = {}) {
    const stopSpinner = overrides.stopSpinner ?? fake();
    const question = overrides.question ?? fake.resolves('123456');
    const close = overrides.close ?? fake();

    return {
        prompt: createOneTimePasswordPrompt({
            clock: overrides.clock ?? createFakeClock(),
            isInteractiveTerminal: overrides.isInteractiveTerminal ?? (() => true),
            stopSpinner: () => {
                stopSpinner();
            },
            createInterface: () => {
                return {
                    question,
                    close: () => {
                        close();
                    }
                };
            }
        }),
        stopSpinner,
        question,
        close
    };
}

test('throws when one-time-password prompting is attempted without an interactive terminal', async () => {
    const { prompt, stopSpinner, question, close } = createPrompt({
        isInteractiveTerminal: () => false
    });

    await expectFailure(async () => {
        await prompt();
    }, /^Error: The registry requested a one-time password, but prompting requires an interactive terminal$/u);

    assert.strictEqual(stopSpinner.callCount, 0);
    assert.strictEqual(question.callCount, 0);
    assert.strictEqual(close.callCount, 0);
});

test('stops the spinner before prompting and trims the entered one-time password', async () => {
    const stopSpinner = fake();
    const question = fake.resolves(' 123456 ');
    const { prompt } = createPrompt({ stopSpinner, question });

    const result = await withPromiseDeadline(prompt(), 'one-time password prompt success');

    assert.strictEqual(result, '123456');
    assert.strictEqual(stopSpinner.callCount, 1);
    assert.deepStrictEqual(question.firstCall.args, ['Registry one-time password: ']);
    assert.ok(stopSpinner.calledBefore(question));
});

test('closes the prompt interface after a successful prompt', async () => {
    const close = fake();
    const { prompt } = createPrompt({ close });

    await withPromiseDeadline(prompt(), 'one-time password prompt close');

    assert.strictEqual(close.callCount, 1);
});

test('closes the prompt interface when the prompt times out', async () => {
    const close = fake();
    const clock = createFakeClock();
    const { prompt } = createPrompt({
        clock,
        close,
        question: async () => {
            return new Promise<string>(() => {
                // Intentionally unresolved to exercise the timeout path.
            });
        }
    });

    const promptPromise = prompt();
    clock.tick(90_000);
    await expectFailure(async () => {
        await withPromiseDeadline(promptPromise, 'one-time password prompt timeout');
    }, /^Error: One-time password input timed out or was empty$/u);

    assert.strictEqual(close.callCount, 1);
});

test('throws when the entered one-time password is empty after trimming', async () => {
    const { prompt } = createPrompt({
        question: fake.resolves('   ')
    });

    await expectFailure(async () => {
        await withPromiseDeadline(prompt(), 'one-time password prompt empty input');
    }, /^Error: One-time password input timed out or was empty$/u);
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
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

type Prompt = {
    readonly prompt: () => Promise<string>;
    readonly stopSpinner: SinonSpy;
    readonly question: Partial<SinonSpy> & (() => Promise<string>);
    readonly close: SinonSpy;
};

type PromptSettings = Required<Overrides>;

function isInteractiveTerminal(): boolean {
    return true;
}

function createPrompt(overrides: Overrides = {}): Prompt {
    const { clock, close, question, stopSpinner, isInteractiveTerminal: isTerminalInteractive }: PromptSettings = {
        clock: createFakeClock(),
        close: fake(),
        isInteractiveTerminal,
        question: fake.resolves('123456'),
        stopSpinner: fake(),
        ...overrides
    };

    return {
        prompt: createOneTimePasswordPrompt({
            clock,
            isInteractiveTerminal: isTerminalInteractive,
            stopSpinner() {
                stopSpinner();
            },
            createInterface() {
                return {
                    question,
                    close() {
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

async function neverResolveString(): Promise<string> {
    return new Promise<string>(function (resolve): void {
        assert.strictEqual(typeof resolve, 'function');
    });
}

suite('one-time-password-prompt', function () {
    test('throws when one-time-password prompting is attempted without an interactive terminal', async function () {
        const { prompt, stopSpinner, question, close } = createPrompt({
            isInteractiveTerminal() {
                return false;
            }
        });

        await expectFailure(async function () {
            await prompt();
        }, /^Error: The registry requested a one-time password, but prompting requires an interactive terminal$/u);

        assert.strictEqual(stopSpinner.callCount, 0);
        assert.strictEqual(question.callCount, 0);
        assert.strictEqual(close.callCount, 0);
    });

    test('stops the spinner before prompting and trims the entered one-time password', async function () {
        const stopSpinner = fake();
        const question = fake.resolves(' 123456 ');
        const { prompt } = createPrompt({ stopSpinner, question });

        const result = await withPromiseDeadline(prompt(), 'one-time password prompt success');

        assert.strictEqual(result, '123456');
        assert.strictEqual(stopSpinner.callCount, 1);
        assert.deepStrictEqual(question.firstCall.args, [ 'Registry one-time password: ' ]);
        assert.ok(stopSpinner.calledBefore(question));
    });

    test('closes the prompt interface after a successful prompt', async function () {
        const close = fake();
        const { prompt } = createPrompt({ close });

        await withPromiseDeadline(prompt(), 'one-time password prompt close');

        assert.strictEqual(close.callCount, 1);
    });

    test('closes the prompt interface when the prompt times out', async function () {
        const close = fake();
        const clock = createFakeClock();
        const { prompt } = createPrompt({
            clock,
            close,
            question: neverResolveString
        });

        const promptPromise = prompt();
        clock.tick(90_000);
        await expectFailure(async function () {
            await withPromiseDeadline(promptPromise, 'one-time password prompt timeout');
        }, /^Error: One-time password input timed out or was empty$/u);

        assert.strictEqual(close.callCount, 1);
    });

    test('throws when the entered one-time password is empty after trimming', async function () {
        const { prompt } = createPrompt({
            question: fake.resolves(' '.repeat(3))
        });

        await expectFailure(async function () {
            await withPromiseDeadline(prompt(), 'one-time password prompt empty input');
        }, /^Error: One-time password input timed out or was empty$/u);
    });
});

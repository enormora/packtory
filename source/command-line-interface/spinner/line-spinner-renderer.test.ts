import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createLineSpinnerRenderer } from './line-spinner-renderer.ts';

function createRendererWithLog() {
    const log = fake();
    return {
        log,
        renderer: createLineSpinnerRenderer({
            log: (message) => {
                log(stripVTControlCharacters(message));
            }
        })
    };
}

function createRendererWithoutLog() {
    return createLineSpinnerRenderer({
        log: () => {
            // noop
        }
    });
}

function expectErrorMessage(callback: () => void, expectedMessage: string): void {
    try {
        callback();
        assert.fail('Expected callback should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('line-spinner-renderer', function () {
    test('add() logs the initial spinner message as a plain line', function () {
        const { log, renderer } = createRendererWithLog();

        renderer.add('the-id', 'pkg-a', 'Scheduled ...');

        assert.strictEqual(log.callCount, 1);
        assert.deepStrictEqual(log.firstCall.args, ['pkg-a: Scheduled ...']);
    });

    test('updateMessage() logs message updates as plain lines', function () {
        const { log, renderer } = createRendererWithLog();

        renderer.add('the-id', 'pkg-a', 'Scheduled ...');
        renderer.updateMessage('the-id', 'Building package with version 1.2.3');

        assert.strictEqual(log.callCount, 2);
        assert.deepStrictEqual(log.secondCall.args, ['pkg-a: Building package with version 1.2.3']);
    });

    test('add() throws when adding two spinners with the same id', function () {
        const renderer = createRendererWithoutLog();

        renderer.add('the-id', 'pkg-a', 'Scheduled ...');

        expectErrorMessage(() => {
            renderer.add('the-id', 'pkg-a', 'Scheduled again');
        }, 'Spinner with id the-id already exists');
    });

    test('updateMessage() throws when trying to change the message of a non-existing spinner', function () {
        const renderer = createRendererWithoutLog();

        expectErrorMessage(() => {
            renderer.updateMessage('the-id', 'Building package with version 1.2.3');
        }, 'Spinner with id the-id does not exist');
    });

    test('stop() logs a success line with the final message', function () {
        const { log, renderer } = createRendererWithLog();

        renderer.add('the-id', 'pkg-a', 'Scheduled ...');
        renderer.stop('the-id', 'success', 'First version 1.2.3 has been published');

        assert.strictEqual(log.callCount, 2);
        assert.deepStrictEqual(log.secondCall.args, ['✔ pkg-a: First version 1.2.3 has been published']);
    });

    test('stop() logs a failure line with the final message', function () {
        const { log, renderer } = createRendererWithLog();

        renderer.add('the-id', 'pkg-a', 'Scheduled ...');
        renderer.stop('the-id', 'failure', 'publish failed');

        assert.strictEqual(log.callCount, 2);
        assert.deepStrictEqual(log.secondCall.args, ['✖ pkg-a: publish failed']);
    });

    test('stop() throws when trying to stop a spinner that does not exist', function () {
        const renderer = createRendererWithoutLog();

        expectErrorMessage(() => {
            renderer.stop('the-id', 'failure', 'publish failed');
        }, 'Spinner with id the-id does not exist');
    });

    test('stopAll() clears tracked spinners without logging cancellation lines', function () {
        const { log, renderer } = createRendererWithLog();

        renderer.add('the-id', 'pkg-a', 'Scheduled ...');
        renderer.stopAll();

        assert.strictEqual(log.callCount, 1);

        renderer.add('the-id', 'pkg-a', 'Scheduled again');

        assert.strictEqual(log.callCount, 2);
        assert.deepStrictEqual(log.secondCall.args, ['pkg-a: Scheduled again']);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { noPublication, stagedForApproval, type PublicationOutcome } from '../../bundle-emitter/publication-outcome.ts';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { registerProgressListeners } from './progress-wiring.ts';

type AddSpinnerCall = {
    readonly kind: 'add';
    readonly identifier: string;
    readonly label: string;
    readonly message: string;
};
type StopSpinnerCall = {
    readonly kind: 'stop';
    readonly identifier: string;
    readonly status: string;
    readonly message: string;
};
type UpdateSpinnerMessageCall = {
    readonly kind: 'updateMessage';
    readonly identifier: string;
    readonly message: string;
};
type SpinnerCall = AddSpinnerCall | StopSpinnerCall | UpdateSpinnerMessageCall;
type CapturedSpinner = {
    readonly renderer: TerminalSpinnerRenderer;
    readonly calls: readonly SpinnerCall[];
};
type DoneStatus = 'already-published' | 'initial-version' | 'new-version';

function captureSpinner(): CapturedSpinner {
    const calls: SpinnerCall[] = [];
    const renderer = {
        add(identifier: string, label: string, message: string) {
            calls.push({ kind: 'add', identifier, label, message });
        },
        updateMessage(identifier: string, message: string) {
            calls.push({ kind: 'updateMessage', identifier, message });
        },
        stop(identifier: string, status: string, message: string) {
            calls.push({ kind: 'stop', identifier, status, message });
        },
        stopAll(): void {
            calls.push({ kind: 'stop', identifier: '', status: 'stopAll', message: '' });
        },
        clear(): void {
            calls.push({ kind: 'stop', identifier: '', status: 'clear', message: '' });
        }
    } as unknown as TerminalSpinnerRenderer;

    return { renderer, calls };
}

function captureDoneSpinnerCalls(
    status: DoneStatus,
    version: string,
    publication: PublicationOutcome
): readonly SpinnerCall[] {
    const broadcaster = createProgressBroadcaster();
    const sink = captureSpinner();
    registerProgressListeners(broadcaster.consumer, sink.renderer);

    broadcaster.provider.emit('done', { packageName: 'package-a', status, version, publication });

    return sink.calls;
}

suite('progress-wiring', function () {
    test('registerProgressListeners adds a spinner when a scheduled event arrives', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('scheduled', { packageName: 'package-a' });

        assert.deepStrictEqual(sink.calls, [ {
            kind: 'add',
            identifier: 'package-a',
            label: 'package-a',
            message: 'Scheduled …'
        } ]);
    });

    test('registerProgressListeners stops the spinner with a failure on an error event', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('error', { packageName: 'package-a', error: new Error('boom') });

        assert.deepStrictEqual(sink.calls, [ {
            kind: 'stop',
            identifier: 'package-a',
            status: 'failure',
            message: 'boom'
        } ]);
    });

    test('registerProgressListeners reports already-published status on a done event', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('done', {
            packageName: 'package-a',
            status: 'already-published',
            version: '1.0.0',
            publication: noPublication
        });

        assert.deepStrictEqual(sink.calls, [
            {
                kind: 'stop',
                identifier: 'package-a',
                status: 'success',
                message: 'Nothing has changed, published version 1.0.0 is already up-to-date'
            }
        ]);
    });

    test('registerProgressListeners reports initial-version status on a done event', function () {
        assert.deepStrictEqual(captureDoneSpinnerCalls('initial-version', '1.0.0', noPublication), [
            {
                kind: 'stop',
                identifier: 'package-a',
                status: 'success',
                message: 'First version 1.0.0 has been published'
            }
        ]);
    });

    test('registerProgressListeners falls back to "New version" for an unknown done status', function () {
        assert.deepStrictEqual(captureDoneSpinnerCalls('new-version', '2.0.0', noPublication), [
            { kind: 'stop', identifier: 'package-a', status: 'success', message: 'New version 2.0.0 published' }
        ]);
    });

    test('registerProgressListeners reports staged publications on a done event', function () {
        assert.deepStrictEqual(captureDoneSpinnerCalls('new-version', '2.0.0', stagedForApproval('stage-123')), [
            {
                kind: 'stop',
                identifier: 'package-a',
                status: 'success',
                message: 'New version 2.0.0 staged (stage-123)'
            }
        ]);
    });

    test('registerProgressListeners reports staged first publications on a done event', function () {
        assert.deepStrictEqual(captureDoneSpinnerCalls('initial-version', '1.0.0', stagedForApproval('stage-123')), [
            {
                kind: 'stop',
                identifier: 'package-a',
                status: 'success',
                message: 'First version 1.0.0 staged (stage-123)'
            }
        ]);
    });

    test('registerProgressListeners updates the spinner message on a building event', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('building', { packageName: 'package-a', version: '1.2.3' });

        assert.deepStrictEqual(sink.calls, [
            { kind: 'updateMessage', identifier: 'package-a', message: 'Building package with version 1.2.3' }
        ]);
    });

    test('registerProgressListeners updates the spinner message on a rebuilding event', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('rebuilding', { packageName: 'package-a', version: '1.2.4' });

        assert.deepStrictEqual(sink.calls, [
            { kind: 'updateMessage', identifier: 'package-a', message: 'Rebuilding package with version 1.2.4' }
        ]);
    });
});

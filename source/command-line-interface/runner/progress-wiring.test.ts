import assert from 'node:assert';
import { suite, test } from 'mocha';
import { noPublication, stagedForApproval, type PublicationOutcome } from '../../bundle-emitter/publication-outcome.ts';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { registerProgressListeners } from './progress-wiring.ts';

type AddSpinnerCall = {
    readonly kind: 'add';
    readonly id: string;
    readonly label: string;
    readonly message: string;
};
type StopSpinnerCall = {
    readonly kind: 'stop';
    readonly id: string;
    readonly status: string;
    readonly message: string;
};
type UpdateSpinnerMessageCall = {
    readonly kind: 'updateMessage';
    readonly id: string;
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
        add(id: string, label: string, message: string) {
            calls.push({ kind: 'add', id, label, message });
        },
        updateMessage(id: string, message: string) {
            calls.push({ kind: 'updateMessage', id, message });
        },
        stop(id: string, status: string, message: string) {
            calls.push({ kind: 'stop', id, status, message });
        },
        stopAll(): void {
            calls.push({ kind: 'stop', id: '', status: 'stopAll', message: '' });
        },
        clear(): void {
            calls.push({ kind: 'stop', id: '', status: 'clear', message: '' });
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

    broadcaster.provider.emit('done', { packageName: 'pkg-a', status, version, publication });

    return sink.calls;
}

suite('progress-wiring', function () {
    test('registerProgressListeners adds a spinner when a scheduled event arrives', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('scheduled', { packageName: 'pkg-a' });

        assert.deepStrictEqual(sink.calls, [ { kind: 'add', id: 'pkg-a', label: 'pkg-a', message: 'Scheduled …' } ]);
    });

    test('registerProgressListeners stops the spinner with a failure on an error event', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('error', { packageName: 'pkg-a', error: new Error('boom') });

        assert.deepStrictEqual(sink.calls, [ { kind: 'stop', id: 'pkg-a', status: 'failure', message: 'boom' } ]);
    });

    test('registerProgressListeners reports already-published status on a done event', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('done', {
            packageName: 'pkg-a',
            status: 'already-published',
            version: '1.0.0',
            publication: noPublication
        });

        assert.deepStrictEqual(sink.calls, [
            {
                kind: 'stop',
                id: 'pkg-a',
                status: 'success',
                message: 'Nothing has changed, published version 1.0.0 is already up-to-date'
            }
        ]);
    });

    test('registerProgressListeners reports initial-version status on a done event', function () {
        assert.deepStrictEqual(captureDoneSpinnerCalls('initial-version', '1.0.0', noPublication), [
            { kind: 'stop', id: 'pkg-a', status: 'success', message: 'First version 1.0.0 has been published' }
        ]);
    });

    test('registerProgressListeners falls back to "New version" for an unknown done status', function () {
        assert.deepStrictEqual(captureDoneSpinnerCalls('new-version', '2.0.0', noPublication), [
            { kind: 'stop', id: 'pkg-a', status: 'success', message: 'New version 2.0.0 published' }
        ]);
    });

    test('registerProgressListeners reports staged publications on a done event', function () {
        assert.deepStrictEqual(captureDoneSpinnerCalls('new-version', '2.0.0', stagedForApproval('stage-123')), [
            { kind: 'stop', id: 'pkg-a', status: 'success', message: 'New version 2.0.0 staged (stage-123)' }
        ]);
    });

    test('registerProgressListeners reports staged first publications on a done event', function () {
        assert.deepStrictEqual(captureDoneSpinnerCalls('initial-version', '1.0.0', stagedForApproval('stage-123')), [
            { kind: 'stop', id: 'pkg-a', status: 'success', message: 'First version 1.0.0 staged (stage-123)' }
        ]);
    });

    test('registerProgressListeners updates the spinner message on a building event', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('building', { packageName: 'pkg-a', version: '1.2.3' });

        assert.deepStrictEqual(sink.calls, [
            { kind: 'updateMessage', id: 'pkg-a', message: 'Building package with version 1.2.3' }
        ]);
    });

    test('registerProgressListeners updates the spinner message on a rebuilding event', function () {
        const broadcaster = createProgressBroadcaster();
        const sink = captureSpinner();
        registerProgressListeners(broadcaster.consumer, sink.renderer);

        broadcaster.provider.emit('rebuilding', { packageName: 'pkg-a', version: '1.2.4' });

        assert.deepStrictEqual(sink.calls, [
            { kind: 'updateMessage', id: 'pkg-a', message: 'Rebuilding package with version 1.2.4' }
        ]);
    });
});

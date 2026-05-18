import type { ProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';

function describeDoneStatus(status: string, version: string): string {
    if (status === 'already-published') {
        return `Nothing has changed, published version ${version} is already up-to-date`;
    }
    if (status === 'initial-version') {
        return `First version ${version} has been published`;
    }
    return `New version ${version} published`;
}

export function registerProgressListeners(
    progressBroadcaster: ProgressBroadcastConsumer,
    spinnerRenderer: TerminalSpinnerRenderer
): void {
    progressBroadcaster.on('scheduled', (payload) => {
        spinnerRenderer.add(payload.packageName, payload.packageName, 'Scheduled …');
    });

    progressBroadcaster.on('error', (payload) => {
        spinnerRenderer.stop(payload.packageName, 'failure', payload.error.message);
    });

    progressBroadcaster.on('done', (payload) => {
        spinnerRenderer.stop(payload.packageName, 'success', describeDoneStatus(payload.status, payload.version));
    });

    progressBroadcaster.on('building', (payload) => {
        spinnerRenderer.updateMessage(payload.packageName, `Building package with version ${payload.version}`);
    });

    progressBroadcaster.on('rebuilding', (payload) => {
        spinnerRenderer.updateMessage(payload.packageName, `Rebuilding package with version ${payload.version}`);
    });
}

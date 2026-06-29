import type { PublicationOutcome } from '../../bundle-emitter/publication-outcome.ts';
import type { ProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';

function describeDoneStatus(status: string, version: string, publication: PublicationOutcome): string {
    if (status === 'already-published') {
        return `Nothing has changed, published version ${version} is already up-to-date`;
    }
    if (publication.type === 'staged') {
        if (status === 'initial-version') {
            return `First version ${version} staged (${publication.stageId})`;
        }
        return `New version ${version} staged (${publication.stageId})`;
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
    progressBroadcaster.on('scheduled', function (payload) {
        spinnerRenderer.add(payload.packageName, payload.packageName, 'Scheduled …');
    });

    progressBroadcaster.on('error', function (payload) {
        spinnerRenderer.stop(payload.packageName, 'failure', payload.error.message);
    });

    progressBroadcaster.on('done', function (payload) {
        spinnerRenderer.stop(
            payload.packageName,
            'success',
            describeDoneStatus(payload.status, payload.version, payload.publication)
        );
    });

    progressBroadcaster.on('building', function (payload) {
        spinnerRenderer.updateMessage(payload.packageName, `Building package with version ${payload.version}`);
    });

    progressBroadcaster.on('rebuilding', function (payload) {
        spinnerRenderer.updateMessage(payload.packageName, `Rebuilding package with version ${payload.version}`);
    });
}

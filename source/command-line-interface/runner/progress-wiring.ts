import {
    progressEventName,
    type ProgressBroadcastConsumer,
    type ProgressEventPayload
} from '../../progress/progress-broadcaster.ts';
import { publishedReleaseStatus, type PublishedReleaseStatus } from '../../packtory/published-release-state.ts';
import { spinnerResultStatus, type TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';

const spinnerEventNames = [
    progressEventName.scheduled,
    progressEventName.error,
    progressEventName.done,
    progressEventName.building,
    progressEventName.rebuilding
] as const;

type SpinnerEventName = (typeof spinnerEventNames)[number];
type SpinnerEventHandler<TEventName extends SpinnerEventName> = (
    spinnerRenderer: TerminalSpinnerRenderer,
    payload: ProgressEventPayload<TEventName>
) => void;
type SpinnerEventHandlers = { [TEventName in SpinnerEventName]: SpinnerEventHandler<TEventName> };

const doneStatusMessage = {
    [publishedReleaseStatus.alreadyPublished]: (version: string) => {
        return `Nothing has changed, published version ${version} is already up-to-date`;
    },
    [publishedReleaseStatus.initialVersion]: (version: string) => {
        return `First version ${version} has been published`;
    },
    [publishedReleaseStatus.newVersion]: (version: string) => {
        return `New version ${version} published`;
    }
} as const satisfies Record<PublishedReleaseStatus, (version: string) => string>;

function describeDoneStatus(status: PublishedReleaseStatus, version: string): string {
    return doneStatusMessage[status](version);
}

const spinnerEventHandlers: SpinnerEventHandlers = {
    [progressEventName.scheduled]: (spinnerRenderer, payload) => {
        spinnerRenderer.add(payload.packageName, payload.packageName, 'Scheduled …');
    },
    [progressEventName.error]: (spinnerRenderer, payload) => {
        spinnerRenderer.stop(payload.packageName, spinnerResultStatus.failure, payload.error.message);
    },
    [progressEventName.done]: (spinnerRenderer, payload) => {
        spinnerRenderer.stop(
            payload.packageName,
            spinnerResultStatus.success,
            describeDoneStatus(payload.status, payload.version)
        );
    },
    [progressEventName.building]: (spinnerRenderer, payload) => {
        spinnerRenderer.updateMessage(payload.packageName, `Building package with version ${payload.version}`);
    },
    [progressEventName.rebuilding]: (spinnerRenderer, payload) => {
        spinnerRenderer.updateMessage(payload.packageName, `Rebuilding package with version ${payload.version}`);
    }
};

function spinnerHandlerFor<TEventName extends SpinnerEventName>(
    spinnerRenderer: TerminalSpinnerRenderer,
    eventName: TEventName
): (payload: ProgressEventPayload<TEventName>) => void {
    return (payload) => {
        spinnerEventHandlers[eventName](spinnerRenderer, payload);
    };
}

export function registerProgressListeners(
    progressBroadcaster: ProgressBroadcastConsumer,
    spinnerRenderer: TerminalSpinnerRenderer
): void {
    for (const eventName of spinnerEventNames) {
        progressBroadcaster.on(eventName, spinnerHandlerFor(spinnerRenderer, eventName));
    }
}

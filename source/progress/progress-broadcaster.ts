import _createEventEmitter, { type Emitter } from 'mitt';

// workaround for https://github.com/developit/mitt/issues/191
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- workaround
const createEventEmitter = _createEventEmitter as unknown as typeof _createEventEmitter.default;

type ProgressEventPayload = {
    readonly packageName: string;
    readonly version: string;
};

type ScheduledEventPayload = {
    readonly packageName: string;
};

type ResolvingEventPayload = {
    readonly packageName: string;
};

type LinkingEventPayload = {
    readonly packageName: string;
};

type ErrorPayload = {
    readonly packageName: string;
    readonly error: Error;
};

type DonePayload = {
    readonly packageName: string;
    readonly version: string;
    readonly status: 'already-published' | 'initial-version' | 'new-version';
};

type Events = {
    readonly scheduled: ScheduledEventPayload;
    readonly resolving: ResolvingEventPayload;
    readonly linking: LinkingEventPayload;
    readonly building: ProgressEventPayload;
    readonly rebuilding: ProgressEventPayload;
    readonly publishing: ProgressEventPayload;
    readonly done: DonePayload;
    readonly error: ErrorPayload;
};

type ProgressBroadcastEmitter = Emitter<Events>;

export type ProgressBroadcastProvider = {
    readonly emit: ProgressBroadcastEmitter['emit'];
};

export type ProgressBroadcastConsumer = {
    readonly on: ProgressBroadcastEmitter['on'];
    readonly off: ProgressBroadcastEmitter['off'];
};

export type ProgressBroadcaster = {
    readonly provider: ProgressBroadcastProvider;
    readonly consumer: ProgressBroadcastConsumer;
};

export function createProgressBroadcaster(): ProgressBroadcaster {
    const emitter = createEventEmitter<Events>();

    return {
        provider: {
            emit: emitter.emit
        },
        consumer: {
            on: emitter.on,
            off: emitter.off
        }
    };
}

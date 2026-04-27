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

type Listener<TPayload> = (payload: TPayload) => void;

export type ProgressBroadcastProvider = {
    readonly emit: <TEventName extends keyof Events>(eventName: TEventName, payload: Events[TEventName]) => void;
};

export type ProgressBroadcastConsumer = {
    readonly on: <TEventName extends keyof Events>(
        eventName: TEventName,
        listener: Listener<Events[TEventName]>
    ) => void;
    readonly off: <TEventName extends keyof Events>(
        eventName: TEventName,
        listener: Listener<Events[TEventName]>
    ) => void;
};

export type ProgressBroadcaster = {
    readonly provider: ProgressBroadcastProvider;
    readonly consumer: ProgressBroadcastConsumer;
};

function createListenerRegistry(): { [TEventName in keyof Events]: Set<Listener<Events[TEventName]>> } {
    return {
        scheduled: new Set(),
        resolving: new Set(),
        linking: new Set(),
        building: new Set(),
        rebuilding: new Set(),
        publishing: new Set(),
        done: new Set(),
        error: new Set()
    };
}

export function createProgressBroadcaster(): ProgressBroadcaster {
    const listeners = createListenerRegistry();

    return {
        provider: {
            emit: (eventName, payload) => {
                listeners[eventName].forEach((listener) => {
                    listener(payload);
                });
            }
        },
        consumer: {
            on: (eventName, listener) => {
                listeners[eventName].add(listener);
            },
            off: (eventName, listener) => {
                listeners[eventName].delete(listener);
            }
        }
    };
}

import type {
    ArtifactEntry,
    EliminationBundleResult,
    ExcludedFile,
    FieldProvenance,
    ImportRewrite,
    IncludedFile,
    RedactedConfig,
    StageName,
    VersionTrigger
} from './event-payloads.ts';

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

type InputsResolvedPayload = {
    readonly packageName: string;
    readonly entryPoints: readonly string[];
    readonly sourceFileCount: number;
    readonly siblingVersions: Readonly<Record<string, string>>;
};

type EffectiveConfigResolvedPayload = {
    readonly packageName: string;
    readonly config: RedactedConfig;
};

type ScanCompletedPayload = {
    readonly packageName: string;
    readonly included: readonly IncludedFile[];
    readonly excluded: readonly ExcludedFile[];
};

type LinkingCompletedPayload = {
    readonly packageName: string;
    readonly rewrites: readonly ImportRewrite[];
};

type EliminationCompletedPayload = {
    readonly perBundle: readonly EliminationBundleResult[];
};

type VersionDeterminedPayload = {
    readonly packageName: string;
    readonly previousVersion: string | undefined;
    readonly chosenVersion: string;
    readonly trigger: VersionTrigger;
};

type PackageJsonAssembledPayload = {
    readonly packageName: string;
    readonly fields: Readonly<Record<string, FieldProvenance>>;
};

type ArtifactsCollectedPayload = {
    readonly packageName: string;
    readonly entries: readonly ArtifactEntry[];
};

type StageTimedPayload = {
    readonly packageName: string;
    readonly stage: StageName;
    readonly durationMs: number;
};

type PackageFailedPayload = {
    readonly packageName: string;
    readonly stage: StageName;
    readonly message: string;
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
    readonly inputsResolved: InputsResolvedPayload;
    readonly effectiveConfigResolved: EffectiveConfigResolvedPayload;
    readonly scanCompleted: ScanCompletedPayload;
    readonly linkingCompleted: LinkingCompletedPayload;
    readonly eliminationCompleted: EliminationCompletedPayload;
    readonly versionDetermined: VersionDeterminedPayload;
    readonly packageJsonAssembled: PackageJsonAssembledPayload;
    readonly artifactsCollected: ArtifactsCollectedPayload;
    readonly stageTimed: StageTimedPayload;
    readonly packageFailed: PackageFailedPayload;
};

type Listener<TPayload> = (payload: TPayload) => void;

export type ProgressEventName =
    | 'building'
    | 'done'
    | 'error'
    | 'linking'
    | 'publishing'
    | 'rebuilding'
    | 'resolving'
    | 'scheduled';

export type ProgressBroadcastProvider = {
    readonly emit: <TEventName extends keyof Events>(eventName: TEventName, payload: Events[TEventName]) => void;
    readonly hasSubscribers: (eventName: keyof Events) => boolean;
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

export type PublicProgressBroadcastConsumer = {
    readonly on: <TEventName extends ProgressEventName>(
        eventName: TEventName,
        listener: Listener<Events[TEventName]>
    ) => void;
    readonly off: <TEventName extends ProgressEventName>(
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
        error: new Set(),
        inputsResolved: new Set(),
        effectiveConfigResolved: new Set(),
        scanCompleted: new Set(),
        linkingCompleted: new Set(),
        eliminationCompleted: new Set(),
        versionDetermined: new Set(),
        packageJsonAssembled: new Set(),
        artifactsCollected: new Set(),
        stageTimed: new Set(),
        packageFailed: new Set()
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
            },
            hasSubscribers: (eventName) => {
                return listeners[eventName].size > 0;
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

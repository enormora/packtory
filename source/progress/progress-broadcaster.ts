import type { PublishedReleaseStatus } from '../packtory/published-release-state.ts';

export type StageName = 'build' | 'eliminate' | 'publish' | 'resolveAndLink' | 'tryPublish';

export type IncludedFile = {
    readonly path: string;
    readonly reason: string;
};

export type ExcludedFile = {
    readonly specifier: string;
    readonly reason: string;
};

export type ImportRewrite = {
    readonly file: string;
    readonly fromSpecifier: string;
    readonly toSpecifier: string;
    readonly targetBundle: string;
};

export const artifactStatus = {
    changed: 'changed',
    generated: 'generated',
    unchanged: 'unchanged'
} as const;

export type ArtifactStatus = (typeof artifactStatus)[keyof typeof artifactStatus];

export const artifactBadge = {
    deadCodeElimination: 'dead-code-elimination',
    importPathRewrite: 'import-path-rewrite'
} as const;

export type ArtifactBadge = (typeof artifactBadge)[keyof typeof artifactBadge];

export const fileDecision = {
    eliminated: 'eliminated',
    kept: 'kept',
    transformed: 'transformed'
} as const;

type FileDecisionKind = (typeof fileDecision)[keyof typeof fileDecision];

export type FileDecision = {
    readonly path: string;
    readonly decision: FileDecisionKind;
    readonly reason: string;
    readonly sourceBytes: number;
    readonly outputBytes?: number;
};

export type DroppedSymbol = {
    readonly file: string;
    readonly symbolName: string;
    readonly kind: string;
    readonly reason: string;
};

export type CrossBundleSeed = {
    readonly binding: string;
    readonly sourceBundle: string;
    readonly consumerBundle: string;
    readonly gatedBy: string;
};

type EliminationBundleResult = {
    readonly packageName: string;
    readonly files: readonly FileDecision[];
    readonly droppedSymbols: readonly DroppedSymbol[];
    readonly seeds: readonly CrossBundleSeed[];
};

export const versionTrigger = {
    autoPatchBump: 'auto-patch-bump',
    initial: 'initial',
    minimum: 'minimum',
    pinned: 'pinned'
} as const;

export type VersionTrigger = (typeof versionTrigger)[keyof typeof versionTrigger];

export type FieldProvenance = {
    readonly source: 'additionalAttributes' | 'derived' | 'mainPackageJson';
    readonly note?: string;
};

export const artifactKind = {
    additional: 'additional',
    manifest: 'manifest',
    sbom: 'sbom',
    source: 'source'
} as const;

type ArtifactKind = (typeof artifactKind)[keyof typeof artifactKind];

export type ArtifactEntry = {
    readonly path: string;
    readonly sizeBytes: number;
    readonly kind: ArtifactKind;
    readonly sourcePath?: string | undefined;
    readonly status: ArtifactStatus;
    readonly badges: readonly ArtifactBadge[];
};

export type EliminatedSourceFile = {
    readonly path: string;
    readonly reason: string;
    readonly sourceBytes: number;
    readonly outputBytes?: number | undefined;
};

export type RedactedConfig = Readonly<Record<string, unknown>>;

type VersionedProgressEventPayload = {
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
    readonly status: PublishedReleaseStatus;
};

type InputsResolvedPayload = {
    readonly packageName: string;
    readonly roots: Readonly<Record<string, string>>;
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

type ProgressEvents = {
    readonly scheduled: ScheduledEventPayload;
    readonly resolving: ResolvingEventPayload;
    readonly linking: LinkingEventPayload;
    readonly building: VersionedProgressEventPayload;
    readonly rebuilding: VersionedProgressEventPayload;
    readonly publishing: VersionedProgressEventPayload;
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

export type ProgressEventName = keyof ProgressEvents;
export type ProgressEventPayload<TEventName extends ProgressEventName> = ProgressEvents[TEventName];

type Listener<TPayload> = (payload: TPayload) => void;

type ListenerRegistry = { [TEventName in ProgressEventName]: Set<Listener<ProgressEventPayload<TEventName>>> };

export const progressEventName = {
    scheduled: 'scheduled',
    resolving: 'resolving',
    linking: 'linking',
    building: 'building',
    rebuilding: 'rebuilding',
    publishing: 'publishing',
    done: 'done',
    error: 'error',
    inputsResolved: 'inputsResolved',
    effectiveConfigResolved: 'effectiveConfigResolved',
    scanCompleted: 'scanCompleted',
    linkingCompleted: 'linkingCompleted',
    eliminationCompleted: 'eliminationCompleted',
    versionDetermined: 'versionDetermined',
    packageJsonAssembled: 'packageJsonAssembled',
    artifactsCollected: 'artifactsCollected',
    stageTimed: 'stageTimed',
    packageFailed: 'packageFailed'
} as const satisfies Record<ProgressEventName, ProgressEventName>;

const publicProgressEventNames = [
    progressEventName.building,
    progressEventName.done,
    progressEventName.error,
    progressEventName.linking,
    progressEventName.publishing,
    progressEventName.rebuilding,
    progressEventName.resolving,
    progressEventName.scheduled
] as const satisfies readonly ProgressEventName[];

type PublicProgressEventName = (typeof publicProgressEventNames)[number];

const progressEventNames = [
    ...publicProgressEventNames,
    progressEventName.inputsResolved,
    progressEventName.effectiveConfigResolved,
    progressEventName.scanCompleted,
    progressEventName.linkingCompleted,
    progressEventName.eliminationCompleted,
    progressEventName.versionDetermined,
    progressEventName.packageJsonAssembled,
    progressEventName.artifactsCollected,
    progressEventName.stageTimed,
    progressEventName.packageFailed
] as const satisfies readonly ProgressEventName[];

export type ProgressBroadcastProvider = {
    readonly emit: <TEventName extends ProgressEventName>(
        eventName: TEventName,
        payload: ProgressEventPayload<TEventName>
    ) => void;
    readonly hasSubscribers: (eventName: ProgressEventName) => boolean;
};

export type ProgressBroadcastConsumer = {
    readonly on: <TEventName extends ProgressEventName>(
        eventName: TEventName,
        listener: Listener<ProgressEventPayload<TEventName>>
    ) => void;
    readonly off: <TEventName extends ProgressEventName>(
        eventName: TEventName,
        listener: Listener<ProgressEventPayload<TEventName>>
    ) => void;
};

export type PublicProgressBroadcastConsumer = {
    readonly on: <TEventName extends PublicProgressEventName>(
        eventName: TEventName,
        listener: Listener<ProgressEventPayload<TEventName>>
    ) => void;
    readonly off: <TEventName extends PublicProgressEventName>(
        eventName: TEventName,
        listener: Listener<ProgressEventPayload<TEventName>>
    ) => void;
};

export type ProgressBroadcaster = {
    readonly provider: ProgressBroadcastProvider;
    readonly consumer: ProgressBroadcastConsumer;
};

function createListenerRegistry(): ListenerRegistry {
    const entries = progressEventNames.map((eventName) => {
        return [eventName, new Set()] as const;
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the event name list fully covers Events
    return Object.fromEntries(entries) as ListenerRegistry;
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

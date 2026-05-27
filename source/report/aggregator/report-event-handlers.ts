import { isDefined, pickBy } from 'remeda';
import {
    fileDecision,
    type EliminatedSourceFile,
    type FileDecision,
    progressEventName,
    type ProgressBroadcastConsumer,
    type ProgressEventPayload
} from '../../progress/progress-broadcaster.ts';
import { createEmptyMutablePackageReport, type MutablePackageReport } from './report-types.ts';

export type AggregatorState = {
    readonly packages: Map<string, MutablePackageReport>;
    readonly disposers: (() => void)[];
};

type Subscribe = ProgressBroadcastConsumer['on'];

const packageEventNames = [
    progressEventName.inputsResolved,
    progressEventName.effectiveConfigResolved,
    progressEventName.versionDetermined,
    progressEventName.packageJsonAssembled,
    progressEventName.scanCompleted,
    progressEventName.linkingCompleted,
    progressEventName.stageTimed,
    progressEventName.packageFailed,
    progressEventName.artifactsCollected
] as const;

type PackageEventName = (typeof packageEventNames)[number];
type PackageEventHandler<TEventName extends PackageEventName> = (
    state: AggregatorState,
    payload: ProgressEventPayload<TEventName>
) => void;
type PackageEventHandlers = { [TEventName in PackageEventName]: PackageEventHandler<TEventName> };
type EliminationPayload = ProgressEventPayload<typeof progressEventName.eliminationCompleted>;
type EliminationBundle = EliminationPayload['perBundle'][number];

function getOrCreate(state: AggregatorState, packageName: string): MutablePackageReport {
    let entry = state.packages.get(packageName);
    if (entry === undefined) {
        entry = createEmptyMutablePackageReport();
        state.packages.set(packageName, entry);
    }
    return entry;
}

function createPackageEventHandlers(): PackageEventHandlers {
    return {
        [progressEventName.inputsResolved]: (state, payload) => {
            const packageReport = getOrCreate(state, payload.packageName);
            packageReport.roots = payload.roots;
            packageReport.siblingVersions = payload.siblingVersions;
            packageReport.sourceFileCount = payload.sourceFileCount;
        },
        [progressEventName.effectiveConfigResolved]: (state, payload) => {
            getOrCreate(state, payload.packageName).effectiveConfig = payload.config;
        },
        [progressEventName.versionDetermined]: (state, payload) => {
            getOrCreate(state, payload.packageName).decisions.version = {
                previousVersion: payload.previousVersion,
                chosenVersion: payload.chosenVersion,
                trigger: payload.trigger
            };
        },
        [progressEventName.packageJsonAssembled]: (state, payload) => {
            getOrCreate(state, payload.packageName).decisions.packageJson = payload.fields;
        },
        [progressEventName.scanCompleted]: (state, payload) => {
            getOrCreate(state, payload.packageName).decisions.dependencyScan = {
                included: payload.included,
                excluded: payload.excluded
            };
        },
        [progressEventName.linkingCompleted]: (state, payload) => {
            getOrCreate(state, payload.packageName).decisions.linker = { rewrites: payload.rewrites };
        },
        [progressEventName.stageTimed]: (state, payload) => {
            getOrCreate(state, payload.packageName).timings[payload.stage] = payload.durationMs;
        },
        [progressEventName.packageFailed]: (state, payload) => {
            getOrCreate(state, payload.packageName).failure = {
                stage: payload.stage,
                message: payload.message
            };
        },
        [progressEventName.artifactsCollected]: (state, payload) => {
            let totalBytes = 0;

            for (const artifactEntry of payload.entries) {
                totalBytes += artifactEntry.sizeBytes;
            }

            getOrCreate(state, payload.packageName).outputs = {
                tarball: { entries: payload.entries, totalBytes }
            };
        }
    };
}

function packageEventHandlerFor<TEventName extends PackageEventName>(
    eventName: TEventName
): PackageEventHandler<TEventName> {
    return createPackageEventHandlers()[eventName];
}

function subscribeToPackageEvent(subscribe: Subscribe, state: AggregatorState, eventName: PackageEventName): void {
    const eventHandler = packageEventHandlerFor(eventName);

    subscribe(eventName, (payload) => {
        eventHandler(state, payload);
    });
}

function toEliminatedSourceFile(file: FileDecision): EliminatedSourceFile {
    return pickBy(
        {
            path: file.path,
            reason: file.reason,
            sourceBytes: file.sourceBytes,
            outputBytes: file.outputBytes
        },
        isDefined
    );
}

function collectEliminationFiles(files: readonly FileDecision[]): {
    readonly eliminatedSourceFiles: readonly EliminatedSourceFile[];
    readonly keptOrChanged: readonly FileDecision[];
} {
    const keptOrChanged: FileDecision[] = [];
    const eliminatedSourceFiles: EliminatedSourceFile[] = [];

    for (const file of files) {
        if (file.decision === fileDecision.eliminated) {
            eliminatedSourceFiles.push(toEliminatedSourceFile(file));
        } else {
            keptOrChanged.push(file);
        }
    }

    return { eliminatedSourceFiles, keptOrChanged };
}

function recordEliminationBundle(state: AggregatorState, bundle: EliminationBundle): void {
    const packageEntry = getOrCreate(state, bundle.packageName);
    const { eliminatedSourceFiles, keptOrChanged } = collectEliminationFiles(bundle.files);

    packageEntry.decisions.deadCodeElimination = {
        files: keptOrChanged,
        symbols: bundle.droppedSymbols,
        seeds: bundle.seeds
    };

    if (eliminatedSourceFiles.length > 0) {
        packageEntry.eliminatedSourceFiles = eliminatedSourceFiles;
    }
}

export function registerSubscribers(state: AggregatorState, consumer: ProgressBroadcastConsumer): void {
    const subscribe: Subscribe = (eventName, handler): void => {
        consumer.on(eventName, handler);
        state.disposers.push(() => {
            consumer.off(eventName, handler);
        });
    };

    for (const eventName of packageEventNames) {
        subscribeToPackageEvent(subscribe, state, eventName);
    }

    subscribe(progressEventName.eliminationCompleted, (payload) => {
        for (const bundle of payload.perBundle) {
            recordEliminationBundle(state, bundle);
        }
    });
}

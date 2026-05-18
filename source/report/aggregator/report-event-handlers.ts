import type { EliminatedSourceFile, ProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import { createEmptyMutablePackageReport, type MutablePackageReport } from './report-types.ts';

export type AggregatorState = {
    readonly packages: Map<string, MutablePackageReport>;
    readonly disposers: (() => void)[];
};

type Subscribe = ProgressBroadcastConsumer['on'];

function getOrCreate(state: AggregatorState, packageName: string): MutablePackageReport {
    let entry = state.packages.get(packageName);
    if (entry === undefined) {
        entry = createEmptyMutablePackageReport();
        state.packages.set(packageName, entry);
    }
    return entry;
}

function registerInputHandlers(state: AggregatorState, subscribe: Subscribe): void {
    subscribe('inputsResolved', (payload) => {
        const entry = getOrCreate(state, payload.packageName);
        entry.roots = payload.roots;
        entry.siblingVersions = payload.siblingVersions;
        entry.sourceFileCount = payload.sourceFileCount;
    });
    subscribe('effectiveConfigResolved', (payload) => {
        getOrCreate(state, payload.packageName).effectiveConfig = payload.config;
    });
}

function registerDecisionHandlers(state: AggregatorState, subscribe: Subscribe): void {
    subscribe('versionDetermined', (payload) => {
        getOrCreate(state, payload.packageName).decisions.version = {
            previousVersion: payload.previousVersion,
            chosenVersion: payload.chosenVersion,
            trigger: payload.trigger
        };
    });
    subscribe('packageJsonAssembled', (payload) => {
        getOrCreate(state, payload.packageName).decisions.packageJson = payload.fields;
    });
    subscribe('scanCompleted', (payload) => {
        getOrCreate(state, payload.packageName).decisions.dependencyScan = {
            included: payload.included,
            excluded: payload.excluded
        };
    });
    subscribe('linkingCompleted', (payload) => {
        getOrCreate(state, payload.packageName).decisions.linker = { rewrites: payload.rewrites };
    });
    subscribe('eliminationCompleted', (payload) => {
        for (const bundle of payload.perBundle) {
            const keptOrChanged = bundle.files.filter((file) => {
                return file.decision !== 'eliminated';
            });
            const eliminatedSourceFiles = bundle.files
                .filter((file) => {
                    return file.decision === 'eliminated';
                })
                .map((file): EliminatedSourceFile => {
                    return {
                        path: file.path,
                        reason: file.reason,
                        sourceBytes: file.sourceBytes,
                        ...(file.outputBytes === undefined ? {} : { outputBytes: file.outputBytes })
                    };
                });
            getOrCreate(state, bundle.packageName).decisions.deadCodeElimination = {
                files: keptOrChanged,
                symbols: bundle.droppedSymbols,
                seeds: bundle.seeds
            };
            if (eliminatedSourceFiles.length > 0) {
                getOrCreate(state, bundle.packageName).eliminatedSourceFiles = eliminatedSourceFiles;
            }
        }
    });
}

function registerOutcomeHandlers(state: AggregatorState, subscribe: Subscribe): void {
    subscribe('stageTimed', (payload) => {
        getOrCreate(state, payload.packageName).timings[payload.stage] = payload.durationMs;
    });
    subscribe('packageFailed', (payload) => {
        getOrCreate(state, payload.packageName).failure = {
            stage: payload.stage,
            message: payload.message
        };
    });
    subscribe('artifactsCollected', (payload) => {
        const totalBytes = payload.entries.reduce((sum, item) => {
            return sum + item.sizeBytes;
        }, 0);
        getOrCreate(state, payload.packageName).outputs = {
            tarball: { entries: payload.entries, totalBytes }
        };
    });
}

export function registerSubscribers(state: AggregatorState, consumer: ProgressBroadcastConsumer): void {
    const subscribe: Subscribe = (eventName, handler): void => {
        consumer.on(eventName, handler);
        state.disposers.push(() => {
            consumer.off(eventName, handler);
        });
    };
    registerInputHandlers(state, subscribe);
    registerDecisionHandlers(state, subscribe);
    registerOutcomeHandlers(state, subscribe);
}

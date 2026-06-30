import { sumBy } from 'remeda';
import type { EliminatedSourceFile, ProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import { createEmptyMutablePackageReport, type MutablePackageReport } from './report-types.ts';

type PackageReportRegistry = {
    readonly get: (packageName: string) => MutablePackageReport | undefined;
    readonly has: (packageName: string) => boolean;
    readonly set: (packageName: string, entry: MutablePackageReport) => unknown;
    readonly [Symbol.iterator]: () => IterableIterator<readonly [string, MutablePackageReport]>;
};

type DisposerRegistry = {
    readonly push: (dispose: () => void) => unknown;
    readonly [Symbol.iterator]: () => IterableIterator<() => void>;
};

export type AggregatorState = {
    readonly packages: PackageReportRegistry;
    readonly disposers: DisposerRegistry;
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

function updatePackage(
    state: AggregatorState,
    packageName: string,
    update: (entry: MutablePackageReport) => MutablePackageReport
): void {
    state.packages.set(packageName, update(getOrCreate(state, packageName)));
}

function registerInputHandlers(state: AggregatorState, subscribe: Subscribe): void {
    subscribe('inputsResolved', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return {
                ...entry,
                roots: payload.roots,
                siblingVersions: payload.siblingVersions,
                sourceFileCount: payload.sourceFileCount
            };
        });
    });
    subscribe('effectiveConfigResolved', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return { ...entry, effectiveConfig: payload.config };
        });
    });
}

function registerDecisionHandlers(state: AggregatorState, subscribe: Subscribe): void {
    subscribe('versionDetermined', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return {
                ...entry,
                decisions: {
                    ...entry.decisions,
                    version: {
                        previousVersion: payload.previousVersion,
                        chosenVersion: payload.chosenVersion,
                        trigger: payload.trigger
                    }
                }
            };
        });
    });
    subscribe('packageJsonAssembled', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return { ...entry, decisions: { ...entry.decisions, packageJson: payload.fields } };
        });
    });
    subscribe('scanCompleted', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return {
                ...entry,
                decisions: {
                    ...entry.decisions,
                    dependencyScan: {
                        included: payload.included,
                        excluded: payload.excluded
                    }
                }
            };
        });
    });
    subscribe('linkingCompleted', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return { ...entry, decisions: { ...entry.decisions, linker: { rewrites: payload.rewrites } } };
        });
    });
    subscribe('eliminationCompleted', function (payload) {
        for (const bundle of payload.perBundle) {
            const keptOrChanged = bundle.files.filter(function (file) {
                return file.decision !== 'eliminated';
            });
            const eliminatedSourceFiles = bundle
                .files
                .filter(function (file) {
                    return file.decision === 'eliminated';
                })
                .map(function (file): EliminatedSourceFile {
                    return {
                        path: file.path,
                        reason: file.reason,
                        sourceBytes: file.sourceBytes,
                        ...file.outputBytes !== undefined && { outputBytes: file.outputBytes }
                    };
                });
            updatePackage(state, bundle.packageName, function (entry) {
                return {
                    ...entry,
                    decisions: {
                        ...entry.decisions,
                        deadCodeElimination: {
                            files: keptOrChanged,
                            symbols: bundle.droppedSymbols,
                            seeds: bundle.seeds
                        }
                    },
                    ...eliminatedSourceFiles.length > 0 && { eliminatedSourceFiles }
                };
            });
        }
    });
}

function registerOutcomeHandlers(state: AggregatorState, subscribe: Subscribe): void {
    subscribe('done', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return { ...entry, publication: payload.publication };
        });
    });
    subscribe('stageTimed', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return { ...entry, timings: { ...entry.timings, [payload.stage]: payload.durationMs } };
        });
    });
    subscribe('packageFailed', function (payload) {
        updatePackage(state, payload.packageName, function (entry) {
            return { ...entry, failure: { stage: payload.stage, message: payload.message } };
        });
    });
    subscribe('artifactsCollected', function (payload) {
        const totalBytes = sumBy(payload.entries, function (item) {
            return item.sizeBytes;
        });
        updatePackage(state, payload.packageName, function (entry) {
            return { ...entry, outputs: { tarball: { entries: payload.entries, totalBytes } } };
        });
    });
}

export function registerSubscribers(state: AggregatorState, consumer: ProgressBroadcastConsumer): void {
    const subscribe: Subscribe = function (eventName, handler): void {
        consumer.on(eventName, handler);
        state.disposers.push(function () {
            consumer.off(eventName, handler);
        });
    };
    registerInputHandlers(state, subscribe);
    registerDecisionHandlers(state, subscribe);
    registerOutcomeHandlers(state, subscribe);
}

import { sumBy } from 'remeda';
import type { EliminatedSourceFile, Events, ProgressBroadcastProvider } from '../../progress/progress-broadcaster.ts';
import { createEmptyPackageReport, type PackageReport } from './report-types.ts';

type PackageReportRegistry = {
    readonly get: (packageName: string) => PackageReport | undefined;
    readonly set: (packageName: string, report: PackageReport) => unknown;
    readonly [Symbol.iterator]: () => IterableIterator<readonly [string, PackageReport]>;
};

export type AggregatorState = {
    readonly packages: PackageReportRegistry;
};

type ReportHandlers = { [TName in keyof Events]: ((payload: Events[TName]) => void) | undefined; };

function getOrCreate(state: AggregatorState, packageName: string): PackageReport {
    let entry = state.packages.get(packageName);
    if (entry === undefined) {
        entry = createEmptyPackageReport();
        state.packages.set(packageName, entry);
    }
    return entry;
}

function updatePackage(
    state: AggregatorState,
    packageName: string,
    update: (entry: PackageReport) => PackageReport
): void {
    state.packages.set(packageName, update(getOrCreate(state, packageName)));
}

function createInputReportHandlers(
    state: AggregatorState
): Pick<ReportHandlers, 'effectiveConfigurationResolved' | 'inputsResolved'> {
    return {
        inputsResolved(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return {
                    ...entry,
                    inputs: {
                        ...entry.inputs,
                        roots: payload.roots,
                        siblingVersions: payload.siblingVersions,
                        sourceFileCount: payload.sourceFileCount
                    }
                };
            });
        },
        effectiveConfigurationResolved(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return {
                    ...entry,
                    inputs: {
                        roots: {},
                        siblingVersions: {},
                        sourceFileCount: 0,
                        ...entry.inputs,
                        effectiveConfiguration: payload.configuration
                    }
                };
            });
        }
    };
}

function createDecisionReportHandlers(
    state: AggregatorState
): Pick<
    ReportHandlers,
    'eliminationCompleted' | 'linkingCompleted' | 'packageManifestAssembled' | 'scanCompleted' | 'versionDetermined'
> {
    return {
        versionDetermined(payload) {
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
        },
        packageManifestAssembled(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return { ...entry, decisions: { ...entry.decisions, packageManifest: payload.fields } };
            });
        },
        scanCompleted(payload) {
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
        },
        linkingCompleted(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return { ...entry, decisions: { ...entry.decisions, linker: { rewrites: payload.rewrites } } };
            });
        },
        eliminationCompleted(payload) {
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
                            ...file.outputBytes === undefined ? {} : { outputBytes: file.outputBytes }
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
                        ...eliminatedSourceFiles.length > 0 ? { eliminatedSourceFiles } : {}
                    };
                });
            }
        }
    };
}

function createOutcomeReportHandlers(
    state: AggregatorState
): Pick<ReportHandlers, 'artifactsCollected' | 'done' | 'packageFailed' | 'stageTimed'> {
    return {
        done(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return { ...entry, publication: payload.publication };
            });
        },
        stageTimed(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return { ...entry, timings: { ...entry.timings, [payload.stage]: payload.durationMilliseconds } };
            });
        },
        packageFailed(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return { ...entry, failure: { stage: payload.stage, message: payload.message } };
            });
        },
        artifactsCollected(payload) {
            const totalBytes = sumBy(payload.entries, function (item) {
                return item.sizeBytes;
            });
            updatePackage(state, payload.packageName, function (entry) {
                return { ...entry, outputs: { tarball: { entries: payload.entries, totalBytes } } };
            });
        }
    };
}

export function createReportEventHandlers(state: AggregatorState): ProgressBroadcastProvider {
    const handlers: ReportHandlers = {
        scheduled: undefined,
        resolving: undefined,
        linking: undefined,
        building: undefined,
        rebuilding: undefined,
        publishing: undefined,
        error: undefined,
        ...createInputReportHandlers(state),
        ...createDecisionReportHandlers(state),
        ...createOutcomeReportHandlers(state),
        packageCaptured(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return { ...entry, packageSnapshot: payload.snapshot };
            });
        },
        workspaceCaptured(payload) {
            updatePackage(state, payload.packageName, function (entry) {
                return { ...entry, workspaceSnapshot: payload.snapshot };
            });
        }
    };
    return {
        emit(eventName, payload) {
            handlers[eventName]?.(payload);
        },
        hasSubscribers(eventName) {
            return handlers[eventName] !== undefined;
        }
    };
}

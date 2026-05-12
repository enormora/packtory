import type { RedactedConfig } from '../progress/event-payloads.ts';
import type { ProgressBroadcastConsumer } from '../progress/progress-broadcaster.ts';
import type { BuildReport, PackageReport } from './types.ts';

type Required<T> = NonNullable<T>;

type Inputs = Required<PackageReport['inputs']>;

type MutablePackageReport = {
    entryPoints?: Inputs['entryPoints'];
    siblingVersions?: Inputs['siblingVersions'];
    sourceFileCount?: Inputs['sourceFileCount'];
    effectiveConfig?: RedactedConfig;
    decisions: {
        dependencyScan?: Required<PackageReport['decisions']['dependencyScan']>;
        deadCodeElimination?: Required<PackageReport['decisions']['deadCodeElimination']>;
        linker?: Required<PackageReport['decisions']['linker']>;
        version?: Required<PackageReport['decisions']['version']>;
        packageJson?: Required<PackageReport['decisions']['packageJson']>;
    };
    outputs?: Required<PackageReport['outputs']>;
    timings: Record<string, number>;
    failure?: Required<PackageReport['failure']>;
};

function hasAnyInput(entry: MutablePackageReport): boolean {
    return (
        entry.entryPoints !== undefined ||
        entry.siblingVersions !== undefined ||
        entry.sourceFileCount !== undefined ||
        entry.effectiveConfig !== undefined
    );
}

function buildInputs(entry: MutablePackageReport): Inputs | undefined {
    if (!hasAnyInput(entry)) {
        return undefined;
    }
    return {
        entryPoints: entry.entryPoints ?? [],
        siblingVersions: entry.siblingVersions ?? {},
        sourceFileCount: entry.sourceFileCount ?? 0,
        ...(entry.effectiveConfig === undefined ? {} : { effectiveConfig: entry.effectiveConfig })
    };
}

function toPackageReport(entry: MutablePackageReport): PackageReport {
    const inputs = buildInputs(entry);
    return {
        decisions: entry.decisions,
        timings: entry.timings,
        ...(inputs === undefined ? {} : { inputs }),
        ...(entry.outputs === undefined ? {} : { outputs: entry.outputs }),
        ...(entry.failure === undefined ? {} : { failure: entry.failure })
    };
}

export type ReportAggregator = {
    readonly unsubscribe: () => void;
    readonly build: () => BuildReport;
};

type AggregatorState = {
    readonly packages: Map<string, MutablePackageReport>;
    readonly disposers: (() => void)[];
};

function getOrCreate(state: AggregatorState, packageName: string): MutablePackageReport {
    let entry = state.packages.get(packageName);
    if (entry === undefined) {
        entry = { decisions: {}, timings: {} };
        state.packages.set(packageName, entry);
    }
    return entry;
}

type Subscribe = ProgressBroadcastConsumer['on'];

function registerInputHandlers(state: AggregatorState, subscribe: Subscribe): void {
    subscribe('inputsResolved', (payload) => {
        const entry = getOrCreate(state, payload.packageName);
        entry.entryPoints = payload.entryPoints;
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
            getOrCreate(state, bundle.packageName).decisions.deadCodeElimination = {
                files: bundle.files,
                symbols: bundle.droppedSymbols,
                seeds: bundle.seeds
            };
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

function registerSubscribers(state: AggregatorState, consumer: ProgressBroadcastConsumer): void {
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

function materialize(state: AggregatorState): BuildReport {
    const packageReports: Record<string, PackageReport> = {};
    for (const [name, entry] of state.packages.entries()) {
        packageReports[name] = toPackageReport(entry);
    }
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        packages: packageReports,
        aggregate: { crossBundleLinks: [] }
    };
}

export function createReportAggregator(consumer: ProgressBroadcastConsumer): ReportAggregator {
    const state: AggregatorState = { packages: new Map(), disposers: [] };
    const memo: { report: BuildReport | undefined } = { report: undefined };
    registerSubscribers(state, consumer);
    return {
        unsubscribe() {
            for (const dispose of state.disposers) {
                dispose();
            }
        },
        build() {
            if (memo.report === undefined) {
                memo.report = materialize(state);
            }
            return memo.report;
        }
    };
}

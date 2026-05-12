import type {
    ArtifactEntry,
    ArtifactBadge,
    CrossBundleSeed,
    DroppedSymbol,
    EliminatedSourceFile,
    ExcludedFile,
    FieldProvenance,
    FileDecision,
    ImportRewrite,
    IncludedFile,
    ProgressBroadcastConsumer,
    RedactedConfig,
    StageName,
    VersionTrigger
} from '../progress/progress-broadcaster.ts';

type VersionDecision = {
    readonly previousVersion: string | undefined;
    readonly chosenVersion: string;
    readonly trigger: VersionTrigger;
};

type CrossBundleLink = {
    readonly fromBundle: string;
    readonly toBundle: string;
};

export type PackageReport = {
    readonly inputs?: {
        readonly entryPoints: readonly string[];
        readonly effectiveConfig?: RedactedConfig;
        readonly siblingVersions: Readonly<Record<string, string>>;
        readonly sourceFileCount: number;
    };
    readonly decisions: {
        readonly dependencyScan?: {
            readonly included: readonly IncludedFile[];
            readonly excluded: readonly ExcludedFile[];
        };
        readonly deadCodeElimination?: {
            readonly files: readonly FileDecision[];
            readonly symbols: readonly DroppedSymbol[];
            readonly seeds: readonly CrossBundleSeed[];
        };
        readonly linker?: { readonly rewrites: readonly ImportRewrite[] };
        readonly version?: VersionDecision;
        readonly packageJson?: Readonly<Record<string, FieldProvenance>>;
    };
    readonly outputs?: {
        readonly tarball: { readonly entries: readonly ArtifactEntry[]; readonly totalBytes: number };
    };
    readonly eliminatedSourceFiles?: readonly EliminatedSourceFile[];
    readonly timings: Readonly<Record<string, number>>;
    readonly failure?: { readonly stage: StageName; readonly message: string };
};

export type BuildReport = {
    readonly schemaVersion: 1;
    readonly generatedAt: string;
    readonly packages: Readonly<Record<string, PackageReport>>;
    readonly aggregate: {
        readonly crossBundleLinks: readonly CrossBundleLink[];
    };
};

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
    eliminatedSourceFiles?: PackageReport['eliminatedSourceFiles'];
    timings: Record<string, number>;
    failure?: Required<PackageReport['failure']>;
};

function materializeInputs(entry: MutablePackageReport): Inputs {
    const base: Inputs = {
        entryPoints: entry.entryPoints ?? [],
        siblingVersions: entry.siblingVersions ?? {},
        sourceFileCount: entry.sourceFileCount ?? 0
    };
    if (entry.effectiveConfig === undefined) {
        return base;
    }
    return { ...base, effectiveConfig: entry.effectiveConfig };
}

function buildInputs(entry: MutablePackageReport): Inputs | undefined {
    if (entry.entryPoints === undefined && entry.effectiveConfig === undefined) {
        return undefined;
    }
    return materializeInputs(entry);
}

function mergeArtifactEntries(
    entries: readonly ArtifactEntry[],
    rewrittenSourcePaths: ReadonlySet<string>,
    transformedSourcePaths: ReadonlySet<string>
): readonly ArtifactEntry[] {
    return entries.map((entry) => {
        if (entry.sourcePath === undefined) {
            return entry;
        }
        const badgeSet = new Set<ArtifactBadge>(entry.badges);
        let status = entry.status;
        if (rewrittenSourcePaths.has(entry.sourcePath)) {
            badgeSet.add('import-path-rewrite');
            status = 'changed';
        }
        if (transformedSourcePaths.has(entry.sourcePath)) {
            badgeSet.add('dead-code-elimination');
            status = 'changed';
        }
        return {
            ...entry,
            status,
            badges: Array.from(badgeSet)
        };
    });
}

function buildOutputs(entry: MutablePackageReport): PackageReport['outputs'] | undefined {
    if (entry.outputs === undefined) {
        return undefined;
    }
    const rewrittenSourcePaths = new Set(
        entry.decisions.linker?.rewrites.map((rewrite) => {
            return rewrite.file;
        }) ?? []
    );
    const transformedSourcePaths = new Set(
        entry.decisions.deadCodeElimination?.files
            .filter((file) => {
                return file.decision === 'transformed';
            })
            .map((file) => {
                return file.path;
            }) ?? []
    );
    return {
        tarball: {
            totalBytes: entry.outputs.tarball.totalBytes,
            entries: mergeArtifactEntries(entry.outputs.tarball.entries, rewrittenSourcePaths, transformedSourcePaths)
        }
    };
}

function toPackageReport(entry: MutablePackageReport): PackageReport {
    const inputs = buildInputs(entry);
    const outputs = buildOutputs(entry);
    return {
        decisions: entry.decisions,
        timings: entry.timings,
        ...(inputs === undefined ? {} : { inputs }),
        ...(outputs === undefined ? {} : { outputs }),
        ...(entry.eliminatedSourceFiles === undefined ? {} : { eliminatedSourceFiles: entry.eliminatedSourceFiles }),
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
    registerSubscribers(state, consumer);
    const memo: BuildReport[] = [];
    return {
        unsubscribe() {
            for (const dispose of state.disposers) {
                dispose();
            }
        },
        build() {
            const [cached] = memo;
            if (cached !== undefined) {
                return cached;
            }
            const fresh = materialize(state);
            memo.push(fresh);
            return fresh;
        }
    };
}

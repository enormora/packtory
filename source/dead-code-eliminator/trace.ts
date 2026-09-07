type EnabledDeadCodeEliminationTrace = {
    readonly collector: DeadCodeEliminationTraceCollector;
};

export type DeadCodeEliminationTrace = EnabledDeadCodeEliminationTrace | undefined;

type DeadCodeEliminationTraceCollector = {
    readonly record: (event: DeadCodeEliminationTraceEvent) => void;
};

type LocalSeedReasons = readonly ['entry-export', 'entry-export-declaration', 'impure-statement'];
export type LocalSeedReason = LocalSeedReasons[number];

type CrossBundleSeedReasons = readonly [
    'default-import',
    'named-import',
    'named-reexport',
    'namespace-import',
    'namespace-reexport'
];
export type CrossBundleSeedReason = CrossBundleSeedReasons[number];

type PruneKinds = readonly ['paired-map-of-pruned-resource', 'unreachable-resource'];
export type PruneKind = PruneKinds[number];

type BindingRemovedTraceEvent = {
    readonly type: 'binding-removed';
    readonly bundleName: string;
    readonly bindingId: string;
    readonly sourceFilePath: string;
};

type CrossBundleSeedTraceEvent = {
    readonly type: 'cross-bundle-seed-added';
    readonly bundleName: string;
    readonly bindingId: string;
    readonly sourceBundleName: string;
    readonly sourceFilePath: string;
    readonly line: number;
    readonly moduleSpecifier: string;
    readonly reason: CrossBundleSeedReason;
};

type EdgeTraceEvent = {
    readonly type: 'edge-added';
    readonly bundleName: string;
    readonly fromBindingId: string;
    readonly toBindingId: string;
    readonly reason: 'identifier-reference';
};

type FilePrunedTraceEvent = {
    readonly type: 'file-pruned';
    readonly bundleName: string;
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly pruneKind: PruneKind;
};

type ImportBindingDroppedTraceEvent = {
    readonly type: 'import-repaired';
    readonly bundleName: string;
    readonly targetFilePath: string;
    readonly moduleSpecifier: string;
    readonly repairKind: 'binding-dropped';
    readonly bindingName: string;
};

type ImportStatementRepairedTraceEvent = {
    readonly type: 'import-repaired';
    readonly bundleName: string;
    readonly targetFilePath: string;
    readonly moduleSpecifier: string;
    readonly repairKind: 'converted-to-bare' | 'removed-declaration-file-import' | 'removed-type-only';
};

type LocalSeedTraceEvent = {
    readonly type: 'local-seed-added';
    readonly bundleName: string;
    readonly bindingId: string;
    readonly sourceFilePath: string;
    readonly line: number;
    readonly reason: LocalSeedReason;
};

type DeadCodeEliminationTraceEvents = readonly [
    BindingRemovedTraceEvent,
    CrossBundleSeedTraceEvent,
    EdgeTraceEvent,
    FilePrunedTraceEvent,
    ImportBindingDroppedTraceEvent,
    ImportStatementRepairedTraceEvent,
    LocalSeedTraceEvent
];

type DeadCodeEliminationTraceEvent = DeadCodeEliminationTraceEvents[number];

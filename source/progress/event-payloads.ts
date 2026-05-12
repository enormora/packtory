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

export type FileDecision = {
    readonly path: string;
    readonly decision: 'eliminated' | 'kept' | 'transformed';
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

export type EliminationBundleResult = {
    readonly packageName: string;
    readonly files: readonly FileDecision[];
    readonly droppedSymbols: readonly DroppedSymbol[];
    readonly seeds: readonly CrossBundleSeed[];
};

export type VersionTrigger = 'auto-patch-bump' | 'initial' | 'minimum' | 'pinned';

export type FieldProvenance = {
    readonly source: 'additionalAttributes' | 'derived' | 'mainPackageJson';
    readonly note?: string;
};

export type ArtifactEntry = {
    readonly path: string;
    readonly sizeBytes: number;
    readonly kind: 'additional' | 'manifest' | 'sbom' | 'source';
};

export type RedactedConfig = Readonly<Record<string, unknown>>;

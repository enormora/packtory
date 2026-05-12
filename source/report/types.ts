import type {
    ArtifactEntry,
    CrossBundleSeed,
    DroppedSymbol,
    ExcludedFile,
    FieldProvenance,
    FileDecision,
    ImportRewrite,
    IncludedFile,
    RedactedConfig,
    StageName,
    VersionTrigger
} from '../progress/event-payloads.ts';

export type VersionDecision = {
    readonly previousVersion: string | undefined;
    readonly chosenVersion: string;
    readonly trigger: VersionTrigger;
};

export type CrossBundleLink = {
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

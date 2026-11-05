import type { WorkspaceSnapshot } from '../inspectors/inspect-workspace.ts';
import type { PublicationOutcome } from '../../bundle-emitter/publication-outcome.ts';
import type {
    ArtifactEntry,
    CrossBundleSeed,
    DroppedSymbol,
    EliminatedSourceFile,
    ExcludedFile,
    FieldProvenance,
    FileDecision,
    ImportRewrite,
    IncludedFile,
    RedactedConfiguration,
    StageName,
    VersionTrigger
} from '../../progress/progress-broadcaster.ts';

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
    readonly workspaceSnapshot?: WorkspaceSnapshot;
    readonly packageSnapshot?: WorkspaceSnapshot;
    readonly inputs?: {
        readonly roots: Readonly<Record<string, string>>;
        readonly effectiveConfiguration?: RedactedConfiguration;
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
        readonly linker?: { readonly rewrites: readonly ImportRewrite[]; };
        readonly version?: VersionDecision;
        readonly packageManifest?: Readonly<Record<string, FieldProvenance>>;
    };
    readonly outputs?: {
        readonly tarball: { readonly entries: readonly ArtifactEntry[]; readonly totalBytes: number; };
    };
    readonly publication?: PublicationOutcome;
    readonly eliminatedSourceFiles?: readonly EliminatedSourceFile[];
    readonly timings: Readonly<Record<string, number>>;
    readonly failure?: { readonly stage: StageName; readonly message: string; };
};

export type BuildReport = {
    readonly schemaVersion: 1;
    readonly generatedAt: string;
    readonly packages: Readonly<Record<string, PackageReport>>;
    readonly aggregate: {
        readonly crossBundleLinks: readonly CrossBundleLink[];
    };
};

export function createEmptyPackageReport(): PackageReport {
    return { decisions: {}, timings: {} };
}

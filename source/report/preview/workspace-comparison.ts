import type { PackageReport } from '../aggregator/report-types.ts';
import type { WorkspaceSnapshot } from '../inspectors/inspect-workspace.ts';
import { compareWorkspaceImports, type ComparisonRow } from './workspace-import-comparison.ts';
import { buildArtifactTree, type PreviewArtifact, type PreviewArtifactNode } from './artifact-tree-builder.ts';

type Module = WorkspaceSnapshot['modules'][number];
type Namespace = 'types' | 'values';

function alphabetical(left: string, right: string): number {
    return left.localeCompare(right);
}

function exportState(module: Module | undefined, namespace: Namespace, name: string): string {
    if (module?.[namespace].includes(name) === true) {
        return 'exported';
    }
    return module?.complete === false ? 'unknown' : 'absent';
}

function moduleNames(module: Module | undefined, namespace: Namespace): readonly string[] {
    return module === undefined ? [] : module[namespace];
}

function resolutionState(module: Module | undefined): string {
    return module?.complete === false ? 'unknown exports' : 'resolved';
}

function compareNames(
    original: Module | undefined,
    emitted: Module | undefined,
    namespace: Namespace,
    specifier: string
): readonly ComparisonRow[] {
    const names = new Set([ ...moduleNames(original, namespace), ...moduleNames(emitted, namespace) ]);
    const label = `${specifier} ${namespace}`;
    const rows = Array.from(names).toSorted(alphabetical).map(function (name) {
        return {
            label: `${label}: ${name}`,
            before: exportState(original, namespace, name),
            after: exportState(emitted, namespace, name)
        };
    });
    if (resolutionState(original) === resolutionState(emitted) && resolutionState(original) === 'resolved') {
        return rows;
    }
    return [ ...rows, { label, before: resolutionState(original), after: resolutionState(emitted) } ];
}

function compareModules(before: WorkspaceSnapshot, after: WorkspaceSnapshot): readonly ComparisonRow[] {
    const originals = new Map(before.modules.map(function (module) {
        return [ module.specifier, module ];
    }));
    const emitted = new Map(after.modules.map(function (module) {
        return [ module.specifier, module ];
    }));
    const specifiers = new Set([ ...originals.keys(), ...emitted.keys() ]);
    return Array.from(specifiers).toSorted(alphabetical).flatMap(function (specifier) {
        return [
            ...compareNames(originals.get(specifier), emitted.get(specifier), 'values', specifier),
            ...compareNames(originals.get(specifier), emitted.get(specifier), 'types', specifier)
        ];
    });
}

function compareDependencies(before: WorkspaceSnapshot, after: WorkspaceSnapshot): readonly ComparisonRow[] {
    return ([ 'dependencies', 'peerDependencies' ] as const).flatMap(function (group) {
        const names = new Set([ ...Object.keys(before[group]), ...Object.keys(after[group]) ]);
        return Array.from(names).toSorted(alphabetical).map(function (name) {
            return {
                label: `${group}: ${name}`,
                before: before[group][name] ?? 'absent',
                after: after[group][name] ?? 'absent'
            };
        });
    });
}

export function compareWorkspace(before: WorkspaceSnapshot, after: WorkspaceSnapshot): readonly ComparisonRow[] {
    const surface = ([ 'exports', 'executables' ] as const)
        .filter(function (field) {
            return before[field] !== after[field];
        })
        .map(function (field) {
            return { label: field, before: before[field], after: after[field] };
        });
    return [
        ...surface,
        ...compareDependencies(before, after),
        ...compareModules(before, after),
        ...compareWorkspaceImports(before.imports, after.imports)
    ];
}

export type WorkspaceComparison = {
    readonly sourceTree: readonly PreviewArtifactNode[] | undefined;
    readonly comparisonRows: readonly ComparisonRow[] | undefined;
};

export function buildWorkspaceComparison(
    report: PackageReport,
    artifacts: readonly PreviewArtifact[]
): WorkspaceComparison {
    const snapshot = report.workspaceSnapshot;
    if (snapshot === undefined) {
        return { sourceTree: undefined, comparisonRows: undefined };
    }
    const sourceTree = buildArtifactTree(snapshot.files.map(function (file): PreviewArtifact {
        const emitted = artifacts.find(function (artifact) {
            return artifact.sourcePath === file.sourcePath;
        });
        return {
            path: file.path,
            sourcePath: file.sourcePath,
            sizeBytes: file.sizeBytes,
            kind: 'source',
            status: emitted?.status ?? 'changed',
            badges: []
        };
    }));
    return {
        sourceTree,
        comparisonRows: report.packageSnapshot === undefined
            ? undefined
            : compareWorkspace(snapshot, report.packageSnapshot)
    };
}

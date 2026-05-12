import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPatch, parsePatch } from 'diff';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { PublishAllResult } from '../packtory/packtory.ts';
import type {
    ArtifactBadge,
    ArtifactEntry,
    ArtifactStatus,
    EliminatedSourceFile
} from '../progress/progress-broadcaster.ts';
import { isCodeFile } from '../common/code-files.ts';
import type { BuildReport, PackageReport } from './report-aggregator.ts';

const diffContextLines = 3;
const diffHunkLimit = 2;

export type PreviewDiffLine = {
    readonly type: 'context' | 'add' | 'remove';
    readonly text: string;
};

export type PreviewDiffHunk = {
    readonly header: string;
    readonly lines: readonly PreviewDiffLine[];
};

export type PreviewArtifactNode = {
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly type: 'directory' | 'file';
    readonly artifact?: PreviewArtifact;
};

export type PreviewArtifact = ArtifactEntry & {
    readonly diff?: readonly PreviewDiffHunk[];
};

export type PreviewPackage = {
    readonly name: string;
    readonly versionTransition?: string | undefined;
    readonly hasChanges: boolean;
    readonly openByDefault: boolean;
    readonly tree: readonly PreviewArtifactNode[];
    readonly eliminatedSourceFiles: readonly EliminatedSourceFile[];
    readonly failure?: PackageReport['failure'];
    readonly diagnostics: PackageReport;
};

export type PreviewSummary = {
    readonly totalPackages: number;
    readonly changedPackages: number;
    readonly unchangedPackages: number;
    readonly failedPackages: number;
    readonly emittedArtifacts: number;
    readonly changedArtifacts: number;
    readonly eliminatedSourceFiles: number;
};

export type PreviewDocument = {
    readonly title: string;
    readonly modeLabel: string;
    readonly previewable: boolean;
    readonly resultType: 'success' | 'partial' | 'config' | 'checks';
    readonly summary: PreviewSummary;
    readonly packages: readonly PreviewPackage[];
    readonly issues: readonly string[];
    readonly report: BuildReport;
};

type PreviewDocumentParams = {
    readonly report: BuildReport;
    readonly result: PublishAllResult;
    readonly dryRun: boolean;
    readonly readWorkspaceFile?: ((filePath: string) => Promise<string>) | undefined;
};

type FinalArtifactContent = {
    readonly content: string;
    readonly sourcePath?: string | undefined;
};

type BundleArtifactIndex = ReadonlyMap<string, ReadonlyMap<string, FinalArtifactContent>>;

type MutableDirectory = {
    readonly name: string;
    readonly path: string;
    readonly depth: number;
    readonly directories: Map<string, MutableDirectory>;
    readonly files: PreviewArtifact[];
};

function isPreviewableResult(result: PublishAllResult): boolean {
    return result.isOk || (result.error.type === 'partial' && result.error.succeeded.length > 0);
}

function getSucceededResults(result: PublishAllResult): readonly BuildAndPublishResult[] {
    if (result.isOk) {
        return result.value;
    }
    if (result.error.type === 'partial') {
        return result.error.succeeded;
    }
    return [];
}

function getIssues(result: PublishAllResult): readonly string[] {
    if (result.isOk) {
        return [];
    }
    if (result.error.type === 'config' || result.error.type === 'checks') {
        return result.error.issues;
    }
    return result.error.failures.map((failure) => {
        return failure.message;
    });
}

function getResultType(result: PublishAllResult): PreviewDocument['resultType'] {
    if (result.isOk) {
        return 'success';
    }
    return result.error.type;
}

function buildBundleArtifactIndex(results: readonly BuildAndPublishResult[]): BundleArtifactIndex {
    return new Map(
        results.map((result) => {
            const entries = new Map<string, FinalArtifactContent>();
            entries.set('package.json', { content: result.bundle.manifestFile.content });
            for (const entry of result.bundle.contents) {
                entries.set(entry.fileDescription.targetFilePath, {
                    content: entry.fileDescription.content,
                    sourcePath: entry.fileDescription.sourceFilePath
                });
            }
            return [result.bundle.name, entries] as const;
        })
    );
}

function isDiffableArtifact(entry: ArtifactEntry): entry is ArtifactEntry & { readonly sourcePath: string } {
    if (entry.sourcePath === undefined || entry.status !== 'changed' || entry.kind !== 'source') {
        return false;
    }
    if (entry.path.endsWith('.map')) {
        return false;
    }
    return isCodeFile(entry.path);
}

function toDiffLineType(line: string): PreviewDiffLine['type'] {
    if (line.startsWith('+')) {
        return 'add';
    }
    if (line.startsWith('-')) {
        return 'remove';
    }
    return 'context';
}

async function buildDiffForArtifact(
    packageName: string,
    artifact: ArtifactEntry,
    bundleArtifactIndex: BundleArtifactIndex,
    readWorkspaceFile: (filePath: string) => Promise<string>
): Promise<readonly PreviewDiffHunk[] | undefined> {
    if (!isDiffableArtifact(artifact)) {
        return undefined;
    }
    const packageArtifacts = bundleArtifactIndex.get(packageName);
    const finalArtifact = packageArtifacts?.get(artifact.path);
    if (finalArtifact === undefined || finalArtifact.sourcePath !== artifact.sourcePath) {
        return undefined;
    }
    const originalContent = await readWorkspaceFile(artifact.sourcePath);
    if (originalContent === finalArtifact.content) {
        return undefined;
    }
    const parsed = parsePatch(
        createPatch(artifact.path, originalContent, finalArtifact.content, 'workspace', 'emitted', {
            context: diffContextLines
        })
    );
    const [patchFile] = parsed;
    if (patchFile === undefined) {
        return undefined;
    }
    return patchFile.hunks.slice(0, diffHunkLimit).map((hunk) => {
        return {
            header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
            lines: hunk.lines
                .filter((line) => {
                    return !line.startsWith('\\');
                })
                .map((line) => {
                    return {
                        type: toDiffLineType(line),
                        text: line
                    };
                })
        };
    });
}

function compareTreeNodes(a: PreviewArtifactNode, b: PreviewArtifactNode): number {
    if (a.type === 'file' && a.name === 'package.json') {
        return -1;
    }
    if (b.type === 'file' && b.name === 'package.json') {
        return 1;
    }
    if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
}

function createDirectory(pathname: string, name: string, depth: number): MutableDirectory {
    return {
        name,
        path: pathname,
        depth,
        directories: new Map(),
        files: []
    };
}

function insertArtifact(root: MutableDirectory, artifact: PreviewArtifact): void {
    const parts = artifact.path.split('/');
    let current = root;
    for (const [index, part] of parts.entries()) {
        const isFile = index === parts.length - 1;
        if (isFile) {
            current.files.push(artifact);
            return;
        }
        const nextPath = current.path === '' ? part : path.posix.join(current.path, part);
        const next = current.directories.get(part) ?? createDirectory(nextPath, part, current.depth + 1);
        current.directories.set(part, next);
        current = next;
    }
}

function flattenTree(directory: MutableDirectory): readonly PreviewArtifactNode[] {
    const nodes: PreviewArtifactNode[] = [];
    const directoryNodes = Array.from(directory.directories.values(), (entry): PreviewArtifactNode => {
        return {
            path: entry.path,
            name: entry.name,
            depth: entry.depth,
            type: 'directory'
        };
    });
    const fileNodes = directory.files.map((artifact): PreviewArtifactNode => {
        return {
            path: artifact.path,
            name: path.posix.basename(artifact.path),
            depth: directory.depth,
            type: 'file',
            artifact
        };
    });
    const children = [...directoryNodes, ...fileNodes].sort(compareTreeNodes);
    for (const child of children) {
        nodes.push(child);
        if (child.type === 'directory') {
            const next = directory.directories.get(child.name);
            if (next !== undefined) {
                nodes.push(...flattenTree(next));
            }
        }
    }
    return nodes;
}

function buildArtifactTree(artifacts: readonly PreviewArtifact[]): readonly PreviewArtifactNode[] {
    const root = createDirectory('', '', 0);
    for (const artifact of artifacts) {
        insertArtifact(root, artifact);
    }
    return flattenTree(root);
}

function buildVersionTransition(packageReport: PackageReport): string | undefined {
    const version = packageReport.decisions.version;
    if (version === undefined) {
        return undefined;
    }
    if (version.previousVersion === undefined) {
        return version.chosenVersion;
    }
    return `${version.previousVersion} -> ${version.chosenVersion}`;
}

function hasMeaningfulChanges(artifacts: readonly PreviewArtifact[], eliminatedSourceFiles: readonly EliminatedSourceFile[]): boolean {
    if (eliminatedSourceFiles.length > 0) {
        return true;
    }
    return artifacts.some((artifact) => {
        return artifact.status === 'changed';
    });
}

function createEmptySummary(): PreviewSummary {
    return {
        totalPackages: 0,
        changedPackages: 0,
        unchangedPackages: 0,
        failedPackages: 0,
        emittedArtifacts: 0,
        changedArtifacts: 0,
        eliminatedSourceFiles: 0
    };
}

export async function buildPreviewDocument(params: PreviewDocumentParams): Promise<PreviewDocument> {
    const readWorkspaceFile = params.readWorkspaceFile ?? (async (filePath: string) => readFile(filePath, 'utf8'));
    const bundleArtifactIndex = buildBundleArtifactIndex(getSucceededResults(params.result));
    const packageEntries = Object.entries(params.report.packages);
    const packages: PreviewPackage[] = [];

    for (const [packageName, packageReport] of packageEntries) {
        const emittedArtifacts = packageReport.outputs?.tarball.entries ?? [];
        const artifacts = await Promise.all(
            emittedArtifacts.map(async (artifact): Promise<PreviewArtifact> => {
                const diff = await buildDiffForArtifact(packageName, artifact, bundleArtifactIndex, readWorkspaceFile);
                return {
                    ...artifact,
                    ...(diff === undefined ? {} : { diff })
                };
            })
        );
        const eliminatedSourceFiles = packageReport.eliminatedSourceFiles ?? [];
        const hasChanges = hasMeaningfulChanges(artifacts, eliminatedSourceFiles);
        packages.push({
            name: packageName,
            versionTransition: buildVersionTransition(packageReport),
            hasChanges,
            openByDefault: hasChanges || packageReport.failure !== undefined,
            tree: buildArtifactTree(artifacts),
            eliminatedSourceFiles,
            failure: packageReport.failure,
            diagnostics: packageReport
        });
    }

    const summary = packages.reduce<PreviewSummary>((current, pkg) => {
        const emittedArtifacts = pkg.tree.filter((entry) => {
            return entry.type === 'file';
        }).length;
        const changedArtifacts = pkg.tree.filter((entry) => {
            return entry.type === 'file' && entry.artifact?.status === 'changed';
        }).length;
        return {
            totalPackages: current.totalPackages + 1,
            changedPackages: current.changedPackages + (pkg.hasChanges ? 1 : 0),
            unchangedPackages: current.unchangedPackages + (!pkg.hasChanges && pkg.failure === undefined ? 1 : 0),
            failedPackages: current.failedPackages + (pkg.failure === undefined ? 0 : 1),
            emittedArtifacts: current.emittedArtifacts + emittedArtifacts,
            changedArtifacts: current.changedArtifacts + changedArtifacts,
            eliminatedSourceFiles: current.eliminatedSourceFiles + pkg.eliminatedSourceFiles.length
        };
    }, createEmptySummary());

    return {
        title: 'Packtory preview',
        modeLabel: params.dryRun ? 'Dry run' : 'Publish',
        previewable: isPreviewableResult(params.result),
        resultType: getResultType(params.result),
        summary,
        packages,
        issues: getIssues(params.result),
        report: params.report
    };
}

export function artifactStatusLabel(status: ArtifactStatus): string {
    if (status === 'generated') {
        return 'generated';
    }
    if (status === 'changed') {
        return 'changed';
    }
    return 'unchanged';
}

export function artifactBadgeLabel(badge: ArtifactBadge): string {
    if (badge === 'dead-code-elimination') {
        return 'DCE';
    }
    return 'rewrite';
}

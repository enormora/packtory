import type { PreviewPackage } from '../preview/preview-document.ts';
import { formatTerminalBytes, renderArtifactNode } from './terminal-artifact-renderer.ts';
import { renderDiffLine, type Colors } from './terminal-preview-renderer-shared.ts';

type EliminatedSourceFile = PreviewPackage['eliminatedSourceFiles'][number];
type ChangedArtifact = PreviewPackage['changedArtifacts'][number];
type DiffHunk = ChangedArtifact['diff'][number];

function renderPackageHeader(previewPackage: PreviewPackage, colors: Colors): string {
    if (previewPackage.versionTransition === undefined) {
        return colors.bold(previewPackage.name);
    }
    return `${colors.bold(previewPackage.name)} ${colors.dim(previewPackage.versionTransition)}`;
}

function renderFailureLine(previewPackage: PreviewPackage, colors: Colors): string | undefined {
    if (previewPackage.failure === undefined) {
        return undefined;
    }
    return `${colors.red('  failure')} ${previewPackage.failure.stage}: ${previewPackage.failure.message}`;
}

function renderTreeLines(previewPackage: PreviewPackage, colors: Colors): readonly string[] {
    return previewPackage.tree.map(function (node) {
        return renderArtifactNode(node, colors);
    });
}

function renderEliminatedSourceFile(file: EliminatedSourceFile, colors: Colors): string {
    const size = colors.dim(`(${formatTerminalBytes(file.sourceBytes)})`);
    return `    - ${file.path} ${size}`;
}

function renderEliminatedSourceFiles(previewPackage: PreviewPackage, colors: Colors): readonly string[] {
    if (previewPackage.eliminatedSourceFiles.length === 0) {
        return [];
    }
    return [
        `  ${colors.bold('Eliminated source files')}`,
        ...previewPackage.eliminatedSourceFiles.map(function (file) {
            return renderEliminatedSourceFile(file, colors);
        })
    ];
}

function renderDiffHunk(hunk: DiffHunk, colors: Colors): readonly string[] {
    return [
        `      ${colors.dim(hunk.header)}`,
        ...hunk.lines.map(function (line) {
            return `      ${renderDiffLine(line, colors)}`;
        })
    ];
}

function renderChangedArtifact(artifact: ChangedArtifact, colors: Colors): readonly string[] {
    return [
        `    ${artifact.path}`,
        ...artifact.diff.flatMap(function (hunk) {
            return renderDiffHunk(hunk, colors);
        })
    ];
}

function renderChangedArtifacts(previewPackage: PreviewPackage, colors: Colors): readonly string[] {
    if (previewPackage.changedArtifacts.length === 0) {
        return [];
    }
    return [
        `  ${colors.bold('Diffs')}`,
        ...previewPackage.changedArtifacts.flatMap(function (artifact) {
            return renderChangedArtifact(artifact, colors);
        })
    ];
}

export function renderPackage(previewPackage: PreviewPackage, colors: Colors): string {
    const lines = [
        renderPackageHeader(previewPackage, colors),
        renderFailureLine(previewPackage, colors),
        ...renderTreeLines(previewPackage, colors),
        ...renderEliminatedSourceFiles(previewPackage, colors),
        ...renderChangedArtifacts(previewPackage, colors)
    ]
        .filter(function (line): line is string {
            return line !== undefined;
        });
    return lines.join('\n');
}

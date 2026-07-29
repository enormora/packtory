import type { PreviewPackage } from '../preview/preview-document.ts';
import { formatTerminalBytes, renderArtifactNode } from './terminal-artifact-renderer.ts';
import { renderDiffLine, type Colors } from './terminal-preview-renderer-shared.ts';

type EliminatedSourceFile = PreviewPackage['eliminatedSourceFiles'][number];
type ChangedArtifact = PreviewPackage['changedArtifacts'][number];
type DiffHunk = ChangedArtifact['diff'][number];

function renderPackageHeader(pkg: PreviewPackage, colors: Colors): string {
    if (pkg.versionTransition === undefined) {
        return colors.bold(pkg.name);
    }
    return `${colors.bold(pkg.name)} ${colors.dim(pkg.versionTransition)}`;
}

function renderFailureLine(pkg: PreviewPackage, colors: Colors): string | undefined {
    if (pkg.failure === undefined) {
        return undefined;
    }
    return `${colors.red('  failure')} ${pkg.failure.stage}: ${pkg.failure.message}`;
}

function renderTreeLines(pkg: PreviewPackage, colors: Colors): readonly string[] {
    return pkg.tree.map(function (node) {
        return renderArtifactNode(node, colors);
    });
}

function renderEliminatedSourceFile(file: EliminatedSourceFile, colors: Colors): string {
    const size = colors.dim(`(${formatTerminalBytes(file.sourceBytes)})`);
    return `    - ${file.path} ${size}`;
}

function renderEliminatedSourceFiles(pkg: PreviewPackage, colors: Colors): readonly string[] {
    if (pkg.eliminatedSourceFiles.length === 0) {
        return [];
    }
    return [
        `  ${colors.bold('Eliminated source files')}`,
        ...pkg.eliminatedSourceFiles.map(function (file) {
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

function renderChangedArtifacts(pkg: PreviewPackage, colors: Colors): readonly string[] {
    if (pkg.changedArtifacts.length === 0) {
        return [];
    }
    return [
        `  ${colors.bold('Diffs')}`,
        ...pkg.changedArtifacts.flatMap(function (artifact) {
            return renderChangedArtifact(artifact, colors);
        })
    ];
}

export function renderPackage(pkg: PreviewPackage, colors: Colors): string {
    const lines = [
        renderPackageHeader(pkg, colors),
        renderFailureLine(pkg, colors),
        ...renderTreeLines(pkg, colors),
        ...renderEliminatedSourceFiles(pkg, colors),
        ...renderChangedArtifacts(pkg, colors)
    ]
        .filter(function (line): line is string {
            return line !== undefined;
        });
    return lines.join('\n');
}

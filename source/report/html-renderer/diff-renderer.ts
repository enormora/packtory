import { collectChangedArtifacts, type ChangedPreviewArtifact } from '../preview/changed-artifacts.ts';
import type { PreviewPackage } from '../preview/preview-document.ts';
import type { PreviewDiffLine } from '../preview/artifact-diff-builder.ts';
import { escapeHtml } from './html-escaping.ts';

function renderDiffLine(line: PreviewDiffLine): string {
    return `<div class="diff-line ${line.type}">${escapeHtml(line.text)}</div>`;
}

function renderDiffHunk(header: string, lines: readonly PreviewDiffLine[]): string {
    let renderedLines = '';
    for (const line of lines) {
        renderedLines += renderDiffLine(line);
    }
    return `<div class="diff-hunk"><div class="diff-header">${escapeHtml(header)}</div>${renderedLines}</div>`;
}

function renderArtifactDiff(artifact: ChangedPreviewArtifact): string {
    let hunks = '';
    for (const hunk of artifact.diff) {
        hunks += renderDiffHunk(hunk.header, hunk.lines);
    }
    return `<details class="diff" open><summary>${escapeHtml(artifact.path)}</summary>${hunks}</details>`;
}

export function renderPackageDiffs(pkg: PreviewPackage): string {
    const changedFiles = collectChangedArtifacts(pkg.tree);
    if (changedFiles.length === 0) {
        return '';
    }
    let sections = '';
    for (const artifact of changedFiles) {
        sections += renderArtifactDiff(artifact);
    }
    return `<section class="package-block"><h3>Changed files</h3>${sections}</section>`;
}

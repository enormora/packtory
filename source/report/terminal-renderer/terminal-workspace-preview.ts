import type { PreviewPackage } from '../preview/preview-package.ts';
import { hiddenArtifactCount, visibleArtifactTree } from '../preview/artifact-visibility.ts';
import { renderArtifactNode } from './terminal-artifact-renderer.ts';
import { renderPackage } from './terminal-package-renderer.ts';
import type { Colors } from './terminal-preview-renderer-shared.ts';

export function renderPackageSummary(previewPackage: PreviewPackage): string {
    const files = previewPackage.tree.filter(function (node) {
        return node.type === 'file';
    });
    const generated = files
        .filter(function (node) {
            return node.artifact.status === 'generated';
        })
        .length;
    const failure = previewPackage.failure === undefined
        ? ''
        : `; failure ${previewPackage.failure.stage}: ${previewPackage.failure.message}`;
    const counts = [
        `${previewPackage.artifactCounts.changed} transformed`,
        `${generated} generated`,
        `${previewPackage.eliminatedSourceFiles.length} removed`
    ]
        .join(', ');
    return `${previewPackage.name}: ${counts}${failure}`;
}

function renderComparison(previewPackage: PreviewPackage, allFiles: boolean): string {
    if (previewPackage.comparisonRows === undefined) {
        return 'Comparison unavailable';
    }
    const rows = previewPackage.comparisonRows.filter(function (row) {
        return allFiles || row.before !== row.after || row.before.includes('unknown');
    });
    const hidden = previewPackage.comparisonRows.length - rows.length;
    const changes = rows.map(function (row) {
        return `${row.label}: ${row.before} -> ${row.after}`;
    });
    return [ ...changes, `${hidden} unchanged comparison rows hidden` ].join('\n');
}

function renderSources(previewPackage: PreviewPackage, allFiles: boolean, colors: Colors): string {
    if (previewPackage.sourceTree === undefined) {
        return 'Comparison unavailable';
    }
    return visibleArtifactTree(previewPackage.sourceTree, allFiles)
        .map(function (node) {
            return renderArtifactNode(node, colors);
        })
        .join('\n');
}

export function renderWorkspacePackage(previewPackage: PreviewPackage, allFiles: boolean, colors: Colors): string {
    const tree = visibleArtifactTree(previewPackage.tree, allFiles);
    return [
        renderPackage({ ...previewPackage, tree }, colors),
        `${hiddenArtifactCount(previewPackage.tree, allFiles)} unchanged output files hidden`,
        'Workspace sources',
        renderSources(previewPackage, allFiles, colors),
        'API and dependencies',
        renderComparison(previewPackage, allFiles)
    ]
        .join('\n');
}

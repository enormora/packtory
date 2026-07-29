import { pathTreeNodeType } from '../../common/path-tree.ts';
import type { PreviewArtifactNode } from '../preview/artifact-tree-builder.ts';
import { artifactBadgeLabel, artifactStatusLabel } from '../preview/preview-document.ts';
import type { Colors } from './terminal-preview-renderer-shared.ts';

export function formatTerminalBytes(bytes: number): string {
    return `${bytes} B`;
}

function renderDirectoryNode(node: PreviewArtifactNode, indent: string, colors: Colors): string {
    const directoryName = colors.bold(`▸ ${node.name}/`);
    return `${indent}${directoryName}`;
}

function renderBadgeText(node: Extract<PreviewArtifactNode, { readonly type: 'file'; }>): string {
    const { artifact } = node;
    const badgeParts = [
        artifactStatusLabel(artifact.status),
        ...artifact.badges.map(artifactBadgeLabel)
    ];
    return badgeParts.join(', ');
}

function renderFileNode(
    node: Extract<PreviewArtifactNode, { readonly type: 'file'; }>,
    indent: string,
    colors: Colors
): string {
    const { artifact } = node;
    const details = colors.dim(`(${artifact.kind}, ${formatTerminalBytes(artifact.sizeBytes)})`);
    const badges = colors.yellow(`[${renderBadgeText(node)}]`);
    return `${indent}• ${artifact.path} ${details} ${badges}`.trimEnd();
}

export function renderArtifactNode(node: PreviewArtifactNode, colors: Colors): string {
    const indent = `  ${'  '.repeat(node.depth)}`;
    if (node.type === pathTreeNodeType.directory) {
        return renderDirectoryNode(node, indent, colors);
    }
    return renderFileNode(node, indent, colors);
}

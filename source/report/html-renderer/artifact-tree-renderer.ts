import { pathTreeNodeType } from '../../common/path-tree.ts';
import { artifactBadgeLabel, artifactStatusLabel } from '../preview/preview-document.ts';
import type { PreviewArtifactNode } from '../preview/artifact-tree-builder.ts';
import { formatBytes, renderBadge } from './html-primitives.ts';
import { escapeHtml } from './html-escaping.ts';

function renderDirectoryNode(
    node: Extract<PreviewArtifactNode, { readonly type: typeof pathTreeNodeType.directory; }>
): string {
    return `<li class="tree-row directory" style="--depth:${node.depth}"><span class="tree-name">${
        escapeHtml(node.name)
    }/</span></li>`;
}

function renderFileNode(node: Extract<PreviewArtifactNode, { readonly type: typeof pathTreeNodeType.file; }>): string {
    const { artifact } = node;
    const badges = [
        renderBadge(artifactStatusLabel(artifact.status), `status-${artifact.status}`),
        ...artifact.badges.map(function (badge) {
            return renderBadge(artifactBadgeLabel(badge), 'secondary');
        })
    ]
        .join('');
    return `<li class="tree-row file" style="--depth:${node.depth}">
        <span class="tree-name">${escapeHtml(node.name)}</span>
        <span class="tree-meta">${escapeHtml(artifact.kind)} · ${escapeHtml(formatBytes(artifact.sizeBytes))}</span>
        <span class="tree-badges">${badges}</span>
    </li>`;
}

export function renderArtifactNode(node: PreviewArtifactNode): string {
    if (node.type === pathTreeNodeType.directory) {
        return renderDirectoryNode(node);
    }
    return renderFileNode(node);
}

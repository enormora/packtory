/* eslint-disable @stylistic/max-len, sonarjs/no-nested-template-literals, functional/prefer-tacit -- terminal rendering is intentionally linear and string-heavy */
import type { PreviewArtifactNode } from '../preview/artifact-tree-builder.ts';
import { artifactBadgeLabel, artifactStatusLabel } from '../preview/preview-document.ts';
import type { Colors } from './terminal-preview-renderer-shared.ts';

function formatBytes(bytes: number): string {
    return `${bytes} B`;
}

export function renderArtifactNode(node: PreviewArtifactNode, colors: Colors): string {
    const indent = `  ${'  '.repeat(node.depth)}`;
    if (node.type === 'directory') {
        return `${indent}${colors.bold(`▸ ${node.name}/`)}`;
    }
    const { artifact } = node;
    const badgeParts = [
        artifactStatusLabel(artifact.status),
        ...artifact.badges.map((badge) => {
            return artifactBadgeLabel(badge);
        })
    ];
    return `${indent}• ${artifact.path} ${colors.dim(`(${artifact.kind}, ${formatBytes(artifact.sizeBytes)})`)} ${colors.yellow(
        `[${badgeParts.join(', ')}]`
    )}`.trimEnd();
}

export { formatBytes as formatTerminalBytes };

import type { PreviewPackage } from '../preview/preview-document.ts';
import { renderArtifactNode } from './artifact-tree-renderer.ts';
import { renderPackageDiffs } from './diff-renderer.ts';
import { renderDiagnostics, renderFailureBanner } from './diagnostics-renderer.ts';
import { renderEliminatedFiles } from './eliminated-files-renderer.ts';
import { escapeHtml } from './html-escaping.ts';
import { renderBadge } from './html-primitives.ts';

function renderPackageBadges(previewPackage: PreviewPackage): string {
    return [
        renderBadge(
            previewPackage.hasChanges ? 'changed' : 'unchanged',
            previewPackage.hasChanges ? 'status-changed' : 'status-unchanged'
        ),
        ...previewPackage.versionTransition === undefined
            ? []
            : [ renderBadge(previewPackage.versionTransition, 'secondary') ]
    ]
        .join('');
}

export function renderPackage(previewPackage: PreviewPackage): string {
    const badges = renderPackageBadges(previewPackage);
    const summary = `<span class="package-title">${escapeHtml(previewPackage.name)}</span>` +
        `<span class="package-summary">${badges}</span>`;

    return `<details class="package"${previewPackage.openByDefault ? ' open' : ''}>
        <summary>${summary}</summary>
        ${renderFailureBanner(previewPackage)}
        <section class="package-block">
            <h3>Artifacts</h3>
            <ul class="tree">${previewPackage.tree.map(renderArtifactNode).join('')}</ul>
        </section>
        ${renderEliminatedFiles(previewPackage)}
        ${renderPackageDiffs(previewPackage)}
        ${renderDiagnostics(previewPackage)}
    </details>`;
}

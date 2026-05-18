/* eslint-disable @stylistic/max-len -- HTML template literals are intentionally long */
import type { PreviewPackage } from '../preview/preview-document.ts';
import { renderArtifactNode } from './artifact-tree-renderer.ts';
import { renderPackageDiffs } from './diff-renderer.ts';
import { renderDiagnostics, renderFailureBanner } from './diagnostics-renderer.ts';
import { renderEliminatedFiles } from './eliminated-files-renderer.ts';
import { escapeHtml } from './html-escaping.ts';
import { renderBadge } from './html-primitives.ts';

function renderPackageBadges(pkg: PreviewPackage): string {
    return [
        renderBadge(pkg.hasChanges ? 'changed' : 'unchanged', pkg.hasChanges ? 'status-changed' : 'status-unchanged'),
        ...(pkg.versionTransition === undefined ? [] : [renderBadge(pkg.versionTransition, 'secondary')])
    ].join('');
}

export function renderPackage(pkg: PreviewPackage): string {
    return `<details class="package"${pkg.openByDefault ? ' open' : ''}>
        <summary><span class="package-title">${escapeHtml(pkg.name)}</span><span class="package-summary">${renderPackageBadges(pkg)}</span></summary>
        ${renderFailureBanner(pkg)}
        <section class="package-block">
            <h3>Artifacts</h3>
            <ul class="tree">${pkg.tree.map(renderArtifactNode).join('')}</ul>
        </section>
        ${renderEliminatedFiles(pkg)}
        ${renderPackageDiffs(pkg)}
        ${renderDiagnostics(pkg)}
    </details>`;
}

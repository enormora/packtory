import type { PreviewPackage } from '../preview/preview-package-types.ts';
import { renderWorkspaceComparison } from './workspace-package-renderer.ts';
import { renderPackageDiffs } from './diff-renderer.ts';
import { renderDiagnostics, renderFailureBanner } from './diagnostics-renderer.ts';
import { renderEliminatedFiles } from './eliminated-files-renderer.ts';
import { escapeHypertextMarkupLanguage } from './hypertext-markup-language-escaping.ts';
import { renderBadge } from './hypertext-markup-language-primitives.ts';

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
    const summary = `<span class="package-title">${escapeHypertextMarkupLanguage(previewPackage.name)}</span>` +
        `<span class="package-summary">${badges}</span>`;

    return `<details class="package"${previewPackage.openByDefault ? ' open' : ''}>
        <summary>${summary}</summary>
        ${renderFailureBanner(previewPackage)}
        ${renderWorkspaceComparison(previewPackage)}
        ${renderEliminatedFiles(previewPackage)}
        ${renderPackageDiffs(previewPackage)}
        ${renderDiagnostics(previewPackage)}
    </details>`;
}

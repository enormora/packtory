import type { PreviewPackage } from '../preview/preview-package-types.ts';
import type { PreviewArtifactNode } from '../preview/artifact-tree-builder.ts';
import { hiddenArtifactCount, visibleArtifactTree } from '../preview/artifact-visibility.ts';
import { renderArtifactNode } from './artifact-tree-renderer.ts';
import { escapeHypertextMarkupLanguage as escapeMarkup } from './hypertext-markup-language-escaping.ts';

function renderTree(tree: readonly PreviewArtifactNode[], allFiles: boolean): string {
    return `<ul class="tree">${visibleArtifactTree(tree, allFiles).map(renderArtifactNode).join('')}</ul>`;
}

function renderTreeChoices(tree: readonly PreviewArtifactNode[] | undefined): string {
    if (tree === undefined) {
        return '<p>Comparison unavailable</p>';
    }
    return `<div class="tree-changes">${renderTree(tree, false)}<p>${
        hiddenArtifactCount(tree, false)
    } unchanged files hidden</p></div><div class="tree-all">${renderTree(tree, true)}</div>`;
}

function renderComparison(previewPackage: PreviewPackage): string {
    if (previewPackage.comparisonRows === undefined) {
        return '<p>Comparison unavailable</p>';
    }
    const rows = previewPackage
        .comparisonRows
        .map(function (row) {
            const unchanged = row.before === row.after && !row.before.includes('unknown');
            return `<tr class="${unchanged ? 'unchanged-row' : 'changed-row'}"><th scope="row">${
                escapeMarkup(row.label)
            }</th><td>${escapeMarkup(row.before)}</td><td>${escapeMarkup(row.after)}</td></tr>`;
        })
        .join('');
    const hidden = previewPackage
        .comparisonRows
        .filter(function (row) {
            return row.before === row.after && !row.before.includes('unknown');
        })
        .length;
    return `<p class="tree-changes">${hidden} unchanged comparison rows hidden</p>` +
        '<table><thead><tr><th scope="col">API or dependency</th><th scope="col">Workspace</th>' +
        `<th scope="col">Package</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderWorkspaceComparison(previewPackage: PreviewPackage): string {
    return `<div class="paired-trees"><section class="package-block"><h3>Workspace sources</h3>${
        renderTreeChoices(previewPackage.sourceTree)
    }</section><section class="package-block"><h3>Artifacts</h3>${
        renderTreeChoices(previewPackage.tree)
    }</section></div><section class="package-block"><h3>API and dependencies</h3>${
        renderComparison(previewPackage)
    }</section>`;
}

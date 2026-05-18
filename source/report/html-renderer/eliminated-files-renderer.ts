/* eslint-disable @stylistic/max-len -- HTML template literals are intentionally long */
import type { PreviewPackage } from '../preview/preview-document.ts';
import { escapeHtml } from './html-escaping.ts';
import { formatBytes } from './html-primitives.ts';

export function renderEliminatedFiles(pkg: PreviewPackage): string {
    if (pkg.eliminatedSourceFiles.length === 0) {
        return '';
    }
    let items = '';
    for (const file of pkg.eliminatedSourceFiles) {
        items += `<li><code>${escapeHtml(file.path)}</code> <span class="tree-meta">${escapeHtml(formatBytes(file.sourceBytes))}</span></li>`;
    }
    return `<section class="package-block">
        <h3>Eliminated source files</h3>
        <ul class="eliminated-list">${items}</ul>
    </section>`;
}

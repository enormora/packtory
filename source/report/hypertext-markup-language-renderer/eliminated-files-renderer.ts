import type { PreviewPackage } from '../preview/preview-document.ts';
import { escapeHypertextMarkupLanguage } from './hypertext-markup-language-escaping.ts';
import { formatBytes } from './hypertext-markup-language-primitives.ts';

export function renderEliminatedFiles(previewPackage: PreviewPackage): string {
    if (previewPackage.eliminatedSourceFiles.length === 0) {
        return '';
    }
    let items = '';
    for (const file of previewPackage.eliminatedSourceFiles) {
        items += `<li><code>${escapeHypertextMarkupLanguage(file.path)}</code> <span class="tree-meta">${
            escapeHypertextMarkupLanguage(formatBytes(file.sourceBytes))
        }</span></li>`;
    }
    return `<section class="package-block">
        <h3>Eliminated source files</h3>
        <ul class="eliminated-list">${items}</ul>
    </section>`;
}

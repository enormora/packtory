/* eslint-disable complexity -- HTML template literals and diagnostic section dispatch are intentionally inline */
import type { PreviewPackage } from '../preview/preview-document.ts';
import { escapeHtml } from './html-escaping.ts';
import { renderCollapsibleSection } from './html-primitives.ts';

export function renderDiagnostics(pkg: PreviewPackage): string {
    const sections = [
        pkg.diagnostics.inputs === undefined ? '' : renderCollapsibleSection('Inputs', pkg.diagnostics.inputs),
        Object.keys(pkg.diagnostics.decisions).length === 0
            ? ''
            : renderCollapsibleSection('Decisions', pkg.diagnostics.decisions),
        pkg.diagnostics.outputs === undefined ? '' : renderCollapsibleSection('Outputs', pkg.diagnostics.outputs),
        pkg.diagnostics.publication === undefined
            ? ''
            : renderCollapsibleSection('Publication', pkg.diagnostics.publication),
        Object.keys(pkg.diagnostics.timings).length === 0
            ? ''
            : renderCollapsibleSection('Timings (ms)', pkg.diagnostics.timings),
        pkg.diagnostics.failure === undefined ? '' : renderCollapsibleSection('Failure', pkg.diagnostics.failure)
    ]
        .join('');
    if (sections === '') {
        return '';
    }
    return `<section class="package-block diagnostics"><h3>Diagnostics</h3>${sections}</section>`;
}

export function renderFailureBanner(pkg: PreviewPackage): string {
    if (pkg.failure === undefined) {
        return '';
    }
    return `<p class="failure">Failed in stage <strong>${escapeHtml(pkg.failure.stage)}</strong>: ${
        escapeHtml(pkg.failure.message)
    }</p>`;
}

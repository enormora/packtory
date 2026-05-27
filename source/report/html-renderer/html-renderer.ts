/* eslint-disable @stylistic/max-len -- HTML template literals are intentionally long */
import type { PreviewDocument } from '../preview/preview-document.ts';
import { escapeHtml } from './html-escaping.ts';
import { renderIssuesSection, renderSummaryCard, serializeJsonBlock } from './html-primitives.ts';
import { htmlReportStyles } from './html-styles.ts';
import { renderPackage } from './package-renderer.ts';

function renderIssues(document: PreviewDocument): string {
    if (document.issues.length === 0) {
        return '';
    }
    let items = '';
    for (const issue of document.issues) {
        items += `<li>${escapeHtml(issue)}</li>`;
    }
    return renderIssuesSection(items);
}

function renderPackages(document: PreviewDocument): string {
    let result = '';
    for (const pkg of document.packages) {
        result += renderPackage(pkg);
    }
    return result;
}

function renderSummaryCards(document: PreviewDocument): string {
    return `
            ${renderSummaryCard('Packages', document.summary.totalPackages)}
            ${renderSummaryCard('Changed', document.summary.changedPackages)}
            ${renderSummaryCard('Unchanged', document.summary.unchangedPackages)}
            ${renderSummaryCard('Failed', document.summary.failedPackages)}
            ${renderSummaryCard('Artifacts', document.summary.emittedArtifacts)}
            ${renderSummaryCard('Changed files', document.summary.changedArtifacts)}
            ${renderSummaryCard('Eliminated', document.summary.eliminatedSourceFiles)}`;
}

export function renderHtmlReport(document: PreviewDocument): string {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Packtory build report</title>
    <style>${htmlReportStyles()}</style>
</head>
<body>
    <main>
        <section class="header">
            <div class="mode-label">${escapeHtml(document.modeLabel)}</div>
            <h1>${escapeHtml(document.title)}</h1>
            <p class="meta">Schema version: ${escapeHtml(String(document.report.schemaVersion))} · Generated at: ${escapeHtml(document.report.generatedAt)}</p>
        </section>
        <section class="summary">${renderSummaryCards(document)}
        </section>
        ${renderIssues(document)}
        <section class="packages">${renderPackages(document)}</section>
        <script type="application/json" id="packtory-report-data">${escapeHtml(serializeJsonBlock(document.report))}</script>
    </main>
</body>
</html>`;
}

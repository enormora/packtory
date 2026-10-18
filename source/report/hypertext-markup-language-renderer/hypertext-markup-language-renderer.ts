import type { PreviewDocument } from '../preview/preview-document.ts';
import { escapeHypertextMarkupLanguage } from './hypertext-markup-language-escaping.ts';
import {
    renderIssuesSection,
    renderSummaryCard,
    serializeJavaScriptObjectNotationBlock
} from './hypertext-markup-language-primitives.ts';
import { hypertextMarkupLanguageReportStyles } from './hypertext-markup-language-styles.ts';
import { renderPackage } from './package-renderer.ts';

function renderIssues(document: PreviewDocument): string {
    if (document.issues.length === 0) {
        return '';
    }
    let items = '';
    for (const issue of document.issues) {
        items += `<li>${escapeHypertextMarkupLanguage(issue)}</li>`;
    }
    return renderIssuesSection(items);
}

function renderPackages(document: PreviewDocument): string {
    let result = '';
    for (const previewPackage of document.packages) {
        result += renderPackage(previewPackage);
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

export function renderHypertextMarkupLanguageReport(document: PreviewDocument): string {
    const generatedAt = escapeHypertextMarkupLanguage(document.report.generatedAt);
    const schemaVersion = escapeHypertextMarkupLanguage(String(document.report.schemaVersion));
    const metadata = `Schema version: ${schemaVersion} · Generated at: ${generatedAt}`;
    const reportData = escapeHypertextMarkupLanguage(serializeJavaScriptObjectNotationBlock(document.report));

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Packtory build report</title>
    <style>${hypertextMarkupLanguageReportStyles()}</style>
</head>
<body>
    <main>
        <section class="header">
            <div class="mode-label">${escapeHypertextMarkupLanguage(document.modeLabel)}</div>
            <h1>${escapeHypertextMarkupLanguage(document.title)}</h1>
            <p class="meta">${metadata}</p>
        </section>
        <section class="summary">${renderSummaryCards(document)}
        </section>
        ${renderIssues(document)}
        <section class="packages">${renderPackages(document)}</section>
        <script type="application/json" id="packtory-report-data">${reportData}</script>
    </main>
</body>
</html>`;
}

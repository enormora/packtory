import { escapeHypertextMarkupLanguage } from './hypertext-markup-language-escaping.ts';

const javaScriptObjectNotationIndentSpaces = 2;

export function serializeJavaScriptObjectNotationBlock(value: unknown): string {
    return JSON.stringify(value, undefined, javaScriptObjectNotationIndentSpaces);
}

function renderJavaScriptObjectNotationBlock(value: unknown): string {
    return `<pre>${escapeHypertextMarkupLanguage(serializeJavaScriptObjectNotationBlock(value))}</pre>`;
}

export function renderCollapsibleSection(title: string, value: unknown): string {
    return `<details class="diagnostic secondary"><summary>${escapeHypertextMarkupLanguage(title)}</summary>${
        renderJavaScriptObjectNotationBlock(value)
    }</details>`;
}

export function formatBytes(bytes: number): string {
    return `${bytes} B`;
}

export function renderBadge(text: string, className: string): string {
    return `<span class="badge ${className}">${escapeHypertextMarkupLanguage(text)}</span>`;
}

export function renderSummaryCard(label: string, value: number): string {
    return `<div class="summary-card"><span class="summary-label">${
        escapeHypertextMarkupLanguage(label)
    }</span><strong>${escapeHypertextMarkupLanguage(String(value))}</strong></div>`;
}

export function renderIssuesSection(issueItems: string): string {
    return `<section class="issues"><h2>Issues</h2><ul>${issueItems}</ul></section>`;
}

import { escapeHtml } from './html-escaping.ts';

const jsonIndentSpaces = 2;

export function serializeJsonBlock(value: unknown): string {
    return JSON.stringify(value, undefined, jsonIndentSpaces);
}

function renderJsonBlock(value: unknown): string {
    return `<pre>${escapeHtml(serializeJsonBlock(value))}</pre>`;
}

export function renderCollapsibleSection(title: string, value: unknown): string {
    return `<details class="diagnostic secondary"><summary>${escapeHtml(title)}</summary>${
        renderJsonBlock(value)
    }</details>`;
}

export function formatBytes(bytes: number): string {
    return `${bytes} B`;
}

export function renderBadge(text: string, className: string): string {
    return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
}

export function renderSummaryCard(label: string, value: number): string {
    return `<div class="summary-card"><span class="summary-label">${escapeHtml(label)}</span><strong>${
        escapeHtml(String(value))
    }</strong></div>`;
}

export function renderIssuesSection(issueItems: string): string {
    return `<section class="issues"><h2>Issues</h2><ul>${issueItems}</ul></section>`;
}

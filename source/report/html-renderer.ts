import type { BuildReport, PackageReport } from './types.ts';

const jsonIndentSpaces = 2;

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderJsonBlock(value: unknown): string {
    return `<pre>${escapeHtml(JSON.stringify(value, undefined, jsonIndentSpaces))}</pre>`;
}

function renderSection(title: string, value: unknown, open = false): string {
    return `<details${open ? ' open' : ''}><summary>${escapeHtml(title)}</summary>${renderJsonBlock(value)}</details>`;
}

function renderInputs(packageReport: PackageReport): string {
    if (packageReport.inputs === undefined) {
        return '';
    }
    return renderSection('Inputs', packageReport.inputs);
}

function renderDecisions(packageReport: PackageReport): string {
    if (Object.keys(packageReport.decisions).length === 0) {
        return '';
    }
    return renderSection('Decisions', packageReport.decisions);
}

function renderOutputs(packageReport: PackageReport): string {
    if (packageReport.outputs === undefined) {
        return '';
    }
    return renderSection('Outputs', packageReport.outputs);
}

function renderTimings(packageReport: PackageReport): string {
    if (Object.keys(packageReport.timings).length === 0) {
        return '';
    }
    return renderSection('Timings (ms)', packageReport.timings);
}

function renderFailure(packageReport: PackageReport): string {
    if (packageReport.failure === undefined) {
        return '';
    }
    const stage = escapeHtml(packageReport.failure.stage);
    const message = escapeHtml(packageReport.failure.message);
    return `<p class="failure">Failed in stage <strong>${stage}</strong>: ${message}</p>`;
}

function renderPackage(name: string, packageReport: PackageReport): string {
    return `<section class="package">
        <h2>${escapeHtml(name)}</h2>
        ${renderFailure(packageReport)}
        ${renderInputs(packageReport)}
        ${renderDecisions(packageReport)}
        ${renderOutputs(packageReport)}
        ${renderTimings(packageReport)}
    </section>`;
}

function renderAggregate(report: BuildReport): string {
    if (report.aggregate.crossBundleLinks.length === 0) {
        return '';
    }
    return renderSection('Cross-bundle links', report.aggregate.crossBundleLinks, true);
}

const styles = `
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; color: #1f2328; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.15rem; border-bottom: 1px solid #d0d7de; padding-bottom: 0.25rem; }
    section.package { margin-bottom: 2rem; }
    details { margin: 0.5rem 0; }
    summary { cursor: pointer; font-weight: 600; }
    pre { background: #f6f8fa; padding: 1rem; overflow-x: auto; font-size: 0.85rem; }
    .failure { color: #cf222e; background: #fff1f0; padding: 0.5rem 0.75rem; border-radius: 0.25rem; }
    .meta { color: #57606a; font-size: 0.85rem; }
`;

export function renderHtmlReport(report: BuildReport): string {
    const packageSections = Object.entries(report.packages)
        .map(([name, packageReport]) => {
            return renderPackage(name, packageReport);
        })
        .join('\n');
    const rawJson = JSON.stringify(report, undefined, jsonIndentSpaces);
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Packtory build report</title>
    <style>${styles}</style>
</head>
<body>
    <h1>Packtory build report</h1>
    <p class="meta">Schema version: ${escapeHtml(String(report.schemaVersion))} · Generated at:
        ${escapeHtml(report.generatedAt)}</p>
    ${renderAggregate(report)}
    ${packageSections}
    <script type="application/json" id="packtory-report-data">${escapeHtml(rawJson)}</script>
</body>
</html>`;
}

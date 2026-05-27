/* cspell:words Palatino Menlo */
/* eslint-disable @stylistic/max-len -- CSS literals are intentionally long */

export function htmlReportStyles(): string {
    return `
    :root {
        color-scheme: light;
        --bg: #f4f0e8;
        --panel: #fffdf8;
        --line: #d8cfc2;
        --text: #2c2924;
        --muted: #6b645a;
        --changed: #b6540d;
        --generated: #0b6e4f;
        --unchanged: #4f6d7a;
        --danger: #b42318;
        --danger-bg: #fff1ef;
        --diff-add: #e7f6ec;
        --diff-remove: #fdecec;
        --diff-header: #efe7da;
        --shadow: 0 18px 50px rgba(63, 48, 29, 0.08);
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        background:
            radial-gradient(circle at top left, rgba(193, 143, 71, 0.15), transparent 28rem),
            linear-gradient(180deg, #f6f2e8 0%, var(--bg) 100%);
        color: var(--text);
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
    }
    main { max-width: 72rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
    h1 { margin: 0 0 0.25rem; font-size: 2rem; }
    h2, h3 { margin: 0 0 0.75rem; }
    .meta { color: var(--muted); margin: 0; }
    .header {
        background: rgba(255, 253, 248, 0.82);
        backdrop-filter: blur(14px);
        border: 1px solid rgba(216, 207, 194, 0.85);
        border-radius: 1.25rem;
        padding: 1.5rem;
        box-shadow: var(--shadow);
    }
    .mode-label {
        display: inline-block;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 0.65rem;
    }
    .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        gap: 0.75rem;
        margin: 1.5rem 0;
    }
    .summary-card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 0.9rem;
        padding: 0.95rem 1rem;
        box-shadow: var(--shadow);
    }
    .summary-label {
        display: block;
        color: var(--muted);
        font-size: 0.82rem;
        margin-bottom: 0.35rem;
    }
    .issues {
        background: var(--danger-bg);
        border: 1px solid rgba(180, 35, 24, 0.22);
        border-radius: 0.9rem;
        padding: 1rem 1.1rem;
        margin: 1rem 0 0;
    }
    .packages { display: grid; gap: 1rem; }
    details.package {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 1rem;
        box-shadow: var(--shadow);
        overflow: hidden;
    }
    details.package > summary {
        cursor: pointer;
        list-style: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.25rem;
        font-weight: 700;
        background: rgba(255, 250, 241, 0.85);
    }
    details.package > summary::-webkit-details-marker { display: none; }
    .package-title { font-size: 1.05rem; }
    .package-summary { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; }
    .package-block { padding: 0 1.25rem 1.25rem; }
    .tree { list-style: none; padding: 0; margin: 0; }
    .tree-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 0.65rem;
        padding: 0.32rem 0;
        padding-left: calc(var(--depth) * 1rem);
        border-bottom: 1px solid rgba(216, 207, 194, 0.35);
        align-items: baseline;
    }
    .tree-row:last-child { border-bottom: 0; }
    .tree-row.directory { grid-template-columns: minmax(0, 1fr); color: var(--muted); font-weight: 700; }
    .tree-name { word-break: break-all; }
    .tree-meta { color: var(--muted); font-size: 0.84rem; }
    .tree-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; justify-content: flex-end; }
    .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.15rem 0.5rem;
        font-size: 0.76rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        border: 1px solid currentColor;
    }
    .badge.secondary { color: var(--muted); }
    .badge.status-changed { color: var(--changed); }
    .badge.status-generated { color: var(--generated); }
    .badge.status-unchanged { color: var(--unchanged); }
    .failure {
        margin: 0 1.25rem 1rem;
        padding: 0.9rem 1rem;
        background: var(--danger-bg);
        border-radius: 0.8rem;
        color: var(--danger);
    }
    .eliminated-list { margin: 0; padding-left: 1.25rem; }
    details.diff, details.diagnostic {
        border: 1px solid rgba(216, 207, 194, 0.7);
        border-radius: 0.8rem;
        margin-top: 0.75rem;
        overflow: hidden;
        background: #fffdfa;
    }
    details.diff > summary, details.diagnostic > summary {
        cursor: pointer;
        list-style: none;
        padding: 0.75rem 0.9rem;
        font-weight: 600;
    }
    details.diff > summary::-webkit-details-marker, details.diagnostic > summary::-webkit-details-marker { display: none; }
    .diff-hunk { border-top: 1px solid rgba(216, 207, 194, 0.5); }
    .diff-header {
        padding: 0.45rem 0.75rem;
        background: var(--diff-header);
        color: var(--muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.8rem;
    }
    .diff-line {
        white-space: pre-wrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.83rem;
        padding: 0.08rem 0.75rem;
    }
    .diff-line.add { background: var(--diff-add); }
    .diff-line.remove { background: var(--diff-remove); }
    pre {
        margin: 0;
        padding: 0.95rem 1rem 1rem;
        overflow-x: auto;
        background: #faf6ef;
        font-size: 0.82rem;
    }
    @media (max-width: 720px) {
        .tree-row { grid-template-columns: minmax(0, 1fr); }
        .tree-badges, .package-summary { justify-content: flex-start; }
    }
`;
}

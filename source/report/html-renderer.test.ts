import assert from 'node:assert';
import { test } from 'mocha';
import { renderHtmlReport } from './html-renderer.ts';
import type { BuildReport } from './report-aggregator.ts';

function baseReport(overrides: Partial<BuildReport> = {}): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-11T00:00:00.000Z',
        packages: {},
        aggregate: { crossBundleLinks: [] },
        ...overrides
    };
}

function decodeHtmlEntities(value: string): string {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
}

function inputsReport(inputs: {
    entryPoints: readonly string[];
    siblingVersions: Readonly<Record<string, string>>;
    sourceFileCount: number;
}): BuildReport {
    return baseReport({
        packages: {
            'pkg-a': { decisions: {}, timings: {}, inputs }
        }
    });
}

test('renders a doctype and html skeleton', () => {
    const html = renderHtmlReport(baseReport());

    assert.match(html, /^<!doctype html>/);
    assert.ok(html.includes('<title>Packtory build report</title>'));
});

test('renders a per-package section with the package name', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': {
                    decisions: {},
                    timings: {}
                }
            }
        })
    );

    assert.ok(html.includes('<h2>pkg-a</h2>'));
});

test('escapes html entities in package names', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                '<script>evil()</script>': {
                    decisions: {},
                    timings: {}
                }
            }
        })
    );

    assert.ok(html.includes('&lt;script&gt;evil()&lt;/script&gt;'));
    assert.ok(!html.includes('<h2><script>'));
});

test('embeds the json data inside a script tag', () => {
    const html = renderHtmlReport(baseReport());

    assert.ok(html.includes('<script type="application/json" id="packtory-report-data">'));
});

test('renders a failure section when the package failed', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': {
                    decisions: {},
                    timings: {},
                    failure: { stage: 'publish', message: 'oh no' }
                }
            }
        })
    );

    assert.ok(html.includes('Failed in stage <strong>publish</strong>'));
    assert.ok(html.includes('oh no'));
});

test('omits the failure section when the package did not fail', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: {} }
            }
        })
    );

    assert.ok(!html.includes('Failed in stage'));
});

test('renders an Inputs section when inputs are present', () => {
    const html = renderHtmlReport(
        inputsReport({ entryPoints: ['pkg-a/index.js'], siblingVersions: {}, sourceFileCount: 1 })
    );

    assert.ok(html.includes('<summary>Inputs</summary>'));
});

test('omits the Inputs section when inputs is undefined', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: {} }
            }
        })
    );

    assert.ok(!html.includes('<summary>Inputs</summary>'));
});

test('renders a Decisions section when decisions has at least one key', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': {
                    decisions: { linker: { rewrites: [] } },
                    timings: {}
                }
            }
        })
    );

    assert.ok(html.includes('<summary>Decisions</summary>'));
});

test('omits the Decisions section when the decisions object is empty', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: {} }
            }
        })
    );

    assert.ok(!html.includes('<summary>Decisions</summary>'));
});

test('renders an Outputs section when outputs are present', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': {
                    decisions: {},
                    timings: {},
                    outputs: { tarball: { entries: [], totalBytes: 0 } }
                }
            }
        })
    );

    assert.ok(html.includes('<summary>Outputs</summary>'));
});

test('omits the Outputs section when outputs is undefined', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: {} }
            }
        })
    );

    assert.ok(!html.includes('<summary>Outputs</summary>'));
});

test('renders a Timings section when timings has at least one key', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: { publish: 12 } }
            }
        })
    );

    assert.ok(html.includes('<summary>Timings (ms)</summary>'));
});

test('omits the Timings section when timings is empty', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: {} }
            }
        })
    );

    assert.ok(!html.includes('<summary>Timings (ms)</summary>'));
});

test('renders a Cross-bundle links section open when aggregate has at least one link', () => {
    const html = renderHtmlReport(
        baseReport({ aggregate: { crossBundleLinks: [{ fromBundle: 'pkg-a', toBundle: 'pkg-b' }] } })
    );

    assert.ok(html.includes('<details open><summary>Cross-bundle links</summary>'));
});

test('omits the Cross-bundle links section when aggregate links is empty', () => {
    const html = renderHtmlReport(baseReport());

    assert.ok(!html.includes('<summary>Cross-bundle links</summary>'));
});

test('omits all content between the meta paragraph and the next element when aggregate links is empty', () => {
    const html = renderHtmlReport(baseReport({ packages: { 'pkg-a': { decisions: {}, timings: {} } } }));

    assert.match(html, /<\/p>\s+<section class="package">/u);
});

test('escapes failure stage and message values', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': {
                    decisions: {},
                    timings: {},
                    failure: { stage: 'publish' as never, message: '<bad>' }
                }
            }
        })
    );

    assert.ok(html.includes('&lt;bad&gt;'));
    assert.ok(!html.includes('<bad>'));
});

test('escapes the generatedAt field', () => {
    const html = renderHtmlReport(baseReport({ generatedAt: '<dangerous>' }));

    assert.ok(html.includes('&lt;dangerous&gt;'));
    assert.ok(!/Generated at:\s+<dangerous>/u.test(html));
});

test('renders the schema version number', () => {
    const html = renderHtmlReport(baseReport({ schemaVersion: 1 }));

    assert.ok(html.includes('Schema version: 1'));
});

test('embeds the entire BuildReport as JSON in the data script tag', () => {
    const report = baseReport({
        packages: { 'pkg-a': { decisions: {}, timings: { publish: 9 } } }
    });
    const html = renderHtmlReport(report);

    const scriptMatch =
        /<script type="application\/json" id="packtory-report-data">(?<encoded>[\s\S]*?)<\/script>/u.exec(html);
    const encoded = scriptMatch?.groups?.encoded;
    if (encoded === undefined) {
        assert.fail('expected packtory-report-data script tag with JSON content');
    }
    assert.deepStrictEqual(JSON.parse(decodeHtmlEntities(encoded)), report);
});

test('escapeHtml encodes ampersand, less-than, greater-than, double-quote, and apostrophe', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'a&b<c>d"e\'f': { decisions: {}, timings: {} }
            }
        })
    );

    assert.ok(html.includes('a&amp;b&lt;c&gt;d&quot;e&#39;f'));
});

test('renders multiple package sections in order of insertion', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: {} },
                'pkg-b': { decisions: {}, timings: {} }
            }
        })
    );

    const aIndex = html.indexOf('<h2>pkg-a</h2>');
    const bIndex = html.indexOf('<h2>pkg-b</h2>');
    assert.ok(aIndex !== -1 && bIndex > aIndex);
});

test('a package section with no inputs/decisions/outputs/timings/failure contains only whitespace between the heading and the closing tag', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: {} }
            }
        })
    );

    assert.match(html, /<section class="package">\s+<h2>pkg-a<\/h2>\s+<\/section>/u);
});

test('joins multiple package sections with a newline separator', () => {
    const html = renderHtmlReport(
        baseReport({
            packages: {
                'pkg-a': { decisions: {}, timings: {} },
                'pkg-b': { decisions: {}, timings: {} }
            }
        })
    );

    assert.match(html, /<\/section>\n<section class="package">/u);
});

test('embeds the body font-family style block in the head', () => {
    const html = renderHtmlReport(baseReport());

    assert.match(html, /<style>[\s\S]*body\s*\{[\s\S]*font-family:[\s\S]*<\/style>/u);
});

test('Inputs section embeds the inputs object as a JSON pre block', () => {
    const inputs = { entryPoints: ['pkg-a/index.js'], siblingVersions: {}, sourceFileCount: 7 };
    const html = renderHtmlReport(inputsReport(inputs));

    const sectionMatch = /<summary>Inputs<\/summary><pre>(?<encoded>[\s\S]*?)<\/pre>/u.exec(html);
    const encoded = sectionMatch?.groups?.encoded;
    if (encoded === undefined) {
        assert.fail('expected an Inputs <pre> block with content');
    }
    assert.deepStrictEqual(JSON.parse(decodeHtmlEntities(encoded)), inputs);
});

test('Inputs section renders with a closed details element (no " open" attribute)', () => {
    const html = renderHtmlReport(
        inputsReport({ entryPoints: ['pkg-a/index.js'], siblingVersions: {}, sourceFileCount: 1 })
    );

    assert.match(html, /<details><summary>Inputs<\/summary>/u);
});

test('Cross-bundle links section renders with an open details element', () => {
    const html = renderHtmlReport(
        baseReport({ aggregate: { crossBundleLinks: [{ fromBundle: 'pkg-a', toBundle: 'pkg-b' }] } })
    );

    assert.match(html, /<details open><summary>Cross-bundle links<\/summary>/u);
});

import assert from 'node:assert';
import { test } from 'mocha';
import {
    createBuildReportFixture,
    createDirectoryDiffPreviewPackageFixture,
    createManifestOnlyPreviewPackageFixture,
    createPreviewDocumentFixture,
    createPreviewPackageFixture
} from '../test-libraries/preview-fixtures.ts';
import { renderHtmlReport } from './html-renderer.ts';
import { escapeHtml } from './html-escaping.ts';

function decodeHtmlEntities(value: string): string {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
}

test('renders a doctype and html skeleton', () => {
    const html = renderHtmlReport(createPreviewDocumentFixture());

    assert.match(html, /^<!doctype html>/);
    assert.ok(html.includes('<title>Packtory build report</title>'));
    assert.match(html, /<style>[\s\S]*color-scheme: light;[\s\S]*\.summary-card[\s\S]*<\/style>/u);
});

test('renders summary cards, package sections, tree metadata, and diff hunks', () => {
    const html = renderHtmlReport(createPreviewDocumentFixture());

    assert.match(
        html,
        /<section class="summary">[\s\S]*<span class="summary-label">Packages<\/span><strong>1<\/strong>[\s\S]*<span class="summary-label">Changed<\/span><strong>1<\/strong>[\s\S]*<span class="summary-label">Unchanged<\/span><strong>0<\/strong>[\s\S]*<span class="summary-label">Failed<\/span><strong>0<\/strong>[\s\S]*<span class="summary-label">Artifacts<\/span><strong>2<\/strong>[\s\S]*<span class="summary-label">Changed files<\/span><strong>1<\/strong>[\s\S]*<span class="summary-label">Eliminated<\/span><strong>1<\/strong>[\s\S]*<\/section>/u
    );
    assert.match(
        html,
        /<details class="package" open>[\s\S]*<span class="package-title">pkg-a<\/span>[\s\S]*<span class="badge status-changed">changed<\/span>[\s\S]*<span class="badge secondary">1\.0\.0 -&gt; 1\.0\.1<\/span>[\s\S]*<\/details>/u
    );
    assert.ok(
        [
            '<ul class="tree"><li class="tree-row file" style="--depth:0">',
            '<span class="tree-name">package.json</span>',
            '<span class="tree-meta">manifest · 2 B</span>',
            '<span class="badge status-generated">generated</span>',
            '<li class="tree-row directory" style="--depth:0"><span class="tree-name">src/</span></li>',
            '<span class="tree-name">index.js</span>',
            '<span class="tree-meta">source · 20 B</span>',
            '<span class="badge status-changed">changed</span>',
            '<span class="badge secondary">DCE</span>'
        ].every((fragment) => html.includes(fragment))
    );
    assert.match(
        html,
        /<section class="package-block"><h3>Changed files<\/h3>[\s\S]*<summary>src\/index\.js<\/summary>[\s\S]*@@ -1,1 \+1,1 @@[\s\S]*-export const removed = 1;[\s\S]*\+export const kept = 1;[\s\S]*<\/section>/u
    );
    assert.match(
        html,
        /<section class="package-block">[\s\S]*<h3>Eliminated source files<\/h3>[\s\S]*\/workspace\/src\/unused\.js[\s\S]*14 B[\s\S]*<\/section>/u
    );
    assert.ok(!html.includes('Stryker was here'));
});

test('opens changed packages by default and collapses unchanged ones', () => {
    const changedHtml = renderHtmlReport(createPreviewDocumentFixture());
    const unchangedHtml = renderHtmlReport(
        createPreviewDocumentFixture({
            packages: [createPreviewPackageFixture({ hasChanges: false, openByDefault: false })]
        })
    );

    assert.ok(changedHtml.includes('<details class="package" open>'));
    assert.ok(unchangedHtml.includes('<details class="package">'));
});

test('renders issues and diagnostics sections', () => {
    const html = renderHtmlReport(
        createPreviewDocumentFixture({
            issues: ['<bad>'],
            packages: [
                createPreviewPackageFixture({
                    diagnostics: {
                        inputs: { entryPoints: ['src/index.js'], siblingVersions: {}, sourceFileCount: 1 },
                        decisions: { linker: { rewrites: [] } },
                        outputs: { tarball: { entries: [], totalBytes: 0 } },
                        timings: { publish: 5 },
                        failure: { stage: 'publish', message: 'secondary' }
                    }
                })
            ]
        })
    );

    assert.ok(html.includes('<h2>Issues</h2>'));
    assert.ok(html.includes('<summary>Inputs</summary>'));
    assert.ok(html.includes('<summary>Decisions</summary>'));
    assert.ok(html.includes('<summary>Outputs</summary>'));
    assert.ok(html.includes('<summary>Timings (ms)</summary>'));
    assert.ok(html.includes('<summary>Failure</summary>'));
    assert.ok(html.includes('&lt;bad&gt;'));
    assert.match(html, /<pre>\{\n {2}&quot;entryPoints&quot;:/u);
    assert.ok(!html.includes('Stryker was here'));
});

test('renders a failure paragraph when the package failed', () => {
    const html = renderHtmlReport(
        createPreviewDocumentFixture({
            packages: [createPreviewPackageFixture({ failure: { stage: 'publish', message: 'boom' } })]
        })
    );

    assert.ok(html.includes('Failed in stage <strong>publish</strong>: boom'));
});

test('omits eliminated, diff, and diagnostics blocks when the package has none', () => {
    const html = renderHtmlReport(
        createPreviewDocumentFixture({
            packages: [createManifestOnlyPreviewPackageFixture()]
        })
    );

    assert.ok(!html.includes('Eliminated source files'));
    assert.ok(!html.includes('<h3>Changed files</h3>'));
    assert.ok(!html.includes('Diagnostics'));
    assert.ok(!html.includes('<h2>Issues</h2>'));
    assert.ok(!html.includes('Stryker was here'));
});

test('embeds the entire BuildReport as escaped JSON in the data script tag', () => {
    const document = createPreviewDocumentFixture();
    const html = renderHtmlReport(document);

    const scriptMatch =
        /<script type="application\/json" id="packtory-report-data">(?<encoded>[\s\S]*?)<\/script>/u.exec(html);
    const encoded = scriptMatch?.groups?.encoded;
    if (encoded === undefined) {
        assert.fail('expected packtory-report-data script tag');
    }
    assert.deepStrictEqual(JSON.parse(decodeHtmlEntities(encoded)), document.report);
});

test('renders package names from the provided report', () => {
    const html = renderHtmlReport(
        createPreviewDocumentFixture({
            report: createBuildReportFixture({
                packages: {
                    'pkg-a': { decisions: {}, timings: {} }
                }
            })
        })
    );

    assert.ok(html.includes('pkg-a'));
});

test('escapeHtml escapes ampersands and apostrophes', () => {
    assert.strictEqual(escapeHtml("Tom & 'Jerry' <tag>"), 'Tom &amp; &#39;Jerry&#39; &lt;tag&gt;');
});

test('renderHtmlReport only renders diff sections for file nodes and omits empty package joins', () => {
    const html = renderHtmlReport(
        createPreviewDocumentFixture({
            packages: [
                createDirectoryDiffPreviewPackageFixture({
                    hasChanges: false
                }),
                createManifestOnlyPreviewPackageFixture({
                    name: 'pkg-b',
                    hasChanges: false
                })
            ]
        })
    );

    assert.ok(!html.includes('<summary>src/index.js</summary>'));
    assert.ok(html.includes('<span class="badge status-unchanged">unchanged</span>'));
    assert.ok(html.includes('pkg-b'));
    assert.ok(!html.includes('Stryker was here'));
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createBuildReportFixture,
    createDirectoryDiffPreviewPackageFixture,
    createManifestOnlyPreviewPackageFixture,
    createPreviewDocumentFixture,
    createPreviewPackageFixture
} from '../../test-libraries/preview-fixtures.ts';
import { renderHypertextMarkupLanguageReport } from './hypertext-markup-language-renderer.ts';
import { escapeHypertextMarkupLanguage } from './hypertext-markup-language-escaping.ts';

function decodeHypertextMarkupLanguageEntities(value: string): string {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
}

suite('hypertext-markup-language-renderer', function () {
    test('renders a doctype and html skeleton', function () {
        const hypertextMarkupLanguage = renderHypertextMarkupLanguageReport(createPreviewDocumentFixture());

        assert.match(hypertextMarkupLanguage, /^<!doctype html>/);
        assert.ok(hypertextMarkupLanguage.includes('<title>Packtory build report</title>'));
        assert.ok(hypertextMarkupLanguage.includes('Schema version: 1'));
        assert.ok(hypertextMarkupLanguage.includes('Generated at: 2026-05-11T00:00:00.000Z'));
        assert.match(
            hypertextMarkupLanguage,
            /<style>[\s\S]*color-scheme: light;[\s\S]*\.summary-card[\s\S]*<\/style>/u
        );
    });

    test('renders summary cards, package sections, tree metadata, and diff hunks', function () {
        const hypertextMarkupLanguage = renderHypertextMarkupLanguageReport(createPreviewDocumentFixture());

        assert.match(
            hypertextMarkupLanguage,
            /<section class="summary">[\s\S]*<span class="summary-label">Packages<\/span><strong>1<\/strong>[\s\S]*<span class="summary-label">Changed<\/span><strong>1<\/strong>[\s\S]*<span class="summary-label">Unchanged<\/span><strong>0<\/strong>[\s\S]*<span class="summary-label">Failed<\/span><strong>0<\/strong>[\s\S]*<span class="summary-label">Artifacts<\/span><strong>2<\/strong>[\s\S]*<span class="summary-label">Changed files<\/span><strong>1<\/strong>[\s\S]*<span class="summary-label">Eliminated<\/span><strong>1<\/strong>[\s\S]*<\/section>/u
        );
        assert.match(
            hypertextMarkupLanguage,
            /<details class="package" open>[\s\S]*<span class="package-title">package-a<\/span>[\s\S]*<span class="badge status-changed">changed<\/span>[\s\S]*<span class="badge secondary">1\.0\.0 -&gt; 1\.0\.1<\/span>[\s\S]*<\/details>/u
        );
        assert.ok(
            [
                '<ul class="tree"><li class="tree-row file" style="--depth:0">',
                '<span class="tree-name">package.json</span>',
                '<span class="tree-meta">manifest · 2 B</span>',
                '<span class="badge status-generated">generated</span>',
                '<li class="tree-row directory" style="--depth:0"><span class="tree-name">source/</span></li>',
                '<span class="tree-name">index.js</span>',
                '<span class="tree-meta">source · 20 B</span>',
                '<span class="badge status-changed">changed</span>',
                '<span class="badge secondary">dead code elimination</span>'
            ]
                .every(function (fragment) {
                    return hypertextMarkupLanguage.includes(fragment);
                })
        );
        assert.match(
            hypertextMarkupLanguage,
            /<section class="package-block"><h3>Changed files<\/h3>[\s\S]*<summary>source\/index\.js<\/summary>[\s\S]*@@ -1,1 \+1,1 @@[\s\S]*-export const removed = 1;[\s\S]*\+export const kept = 1;[\s\S]*<\/section>/u
        );
        assert.match(
            hypertextMarkupLanguage,
            /<section class="package-block">[\s\S]*<h3>Eliminated source files<\/h3>[\s\S]*\/workspace\/source\/unused\.js[\s\S]*14 B[\s\S]*<\/section>/u
        );
        assert.ok(!hypertextMarkupLanguage.includes('Stryker was here'));
    });

    test('opens changed packages by default and collapses unchanged ones', function () {
        const changedHypertextMarkupLanguage = renderHypertextMarkupLanguageReport(createPreviewDocumentFixture());
        const unchangedHypertextMarkupLanguage = renderHypertextMarkupLanguageReport(
            createPreviewDocumentFixture({
                packages: [ createPreviewPackageFixture({ hasChanges: false, openByDefault: false }) ]
            })
        );

        assert.ok(changedHypertextMarkupLanguage.includes('<details class="package" open>'));
        assert.ok(unchangedHypertextMarkupLanguage.includes('<details class="package">'));
    });

    test('renders issues and diagnostics sections', function () {
        const hypertextMarkupLanguage = renderHypertextMarkupLanguageReport(
            createPreviewDocumentFixture({
                issues: [ '<bad>' ],
                packages: [
                    createPreviewPackageFixture({
                        diagnostics: {
                            inputs: { roots: { main: 'source/index.js' }, siblingVersions: {}, sourceFileCount: 1 },
                            decisions: { linker: { rewrites: [] } },
                            outputs: { tarball: { entries: [], totalBytes: 0 } },
                            timings: { publish: 5 },
                            failure: { stage: 'publish', message: 'secondary' }
                        }
                    })
                ]
            })
        );

        assert.ok(hypertextMarkupLanguage.includes('<h2>Issues</h2>'));
        assert.ok(hypertextMarkupLanguage.includes('<summary>Inputs</summary>'));
        assert.ok(hypertextMarkupLanguage.includes('<summary>Decisions</summary>'));
        assert.ok(hypertextMarkupLanguage.includes('<summary>Outputs</summary>'));
        assert.ok(hypertextMarkupLanguage.includes('<summary>Timings (ms)</summary>'));
        assert.ok(hypertextMarkupLanguage.includes('<summary>Failure</summary>'));
        assert.ok(hypertextMarkupLanguage.includes('&lt;bad&gt;'));
        assert.match(hypertextMarkupLanguage, /<pre>\{\n {2}&quot;roots&quot;:/u);
        assert.ok(!hypertextMarkupLanguage.includes('Stryker was here'));
    });

    test('renders a failure paragraph when the package failed', function () {
        const hypertextMarkupLanguage = renderHypertextMarkupLanguageReport(
            createPreviewDocumentFixture({
                packages: [ createPreviewPackageFixture({ failure: { stage: 'publish', message: 'boom' } }) ]
            })
        );

        assert.ok(hypertextMarkupLanguage.includes('Failed in stage <strong>publish</strong>: boom'));
    });

    test('omits eliminated, diff, and diagnostics blocks when the package has none', function () {
        const hypertextMarkupLanguage = renderHypertextMarkupLanguageReport(
            createPreviewDocumentFixture({
                packages: [ createManifestOnlyPreviewPackageFixture() ]
            })
        );

        assert.ok(!hypertextMarkupLanguage.includes('Eliminated source files'));
        assert.ok(!hypertextMarkupLanguage.includes('<h3>Changed files</h3>'));
        assert.ok(!hypertextMarkupLanguage.includes('Diagnostics'));
        assert.ok(!hypertextMarkupLanguage.includes('<h2>Issues</h2>'));
        assert.ok(!hypertextMarkupLanguage.includes('Stryker was here'));
    });

    test('embeds the entire BuildReport as escaped JSON in the data script tag', function () {
        const document = createPreviewDocumentFixture();
        const hypertextMarkupLanguage = renderHypertextMarkupLanguageReport(document);

        const scriptMatch = /<script type="application\/json" id="packtory-report-data">(?<encoded>[\s\S]*?)<\/script>/u
            .exec(hypertextMarkupLanguage);
        const encoded = scriptMatch?.groups?.encoded;
        if (encoded === undefined) {
            assert.fail('expected packtory-report-data script tag');
        }
        assert.deepStrictEqual(JSON.parse(decodeHypertextMarkupLanguageEntities(encoded)), document.report);
    });

    test('renders package names from the provided report', function () {
        const hypertextMarkupLanguage = renderHypertextMarkupLanguageReport(
            createPreviewDocumentFixture({
                report: createBuildReportFixture({
                    packages: {
                        'package-a': { decisions: {}, timings: {} }
                    }
                })
            })
        );

        assert.ok(hypertextMarkupLanguage.includes('package-a'));
    });

    test('escapeHypertextMarkupLanguage escapes ampersands and apostrophes', function () {
        assert.strictEqual(
            escapeHypertextMarkupLanguage("Tom & 'Jerry' <tag>"),
            'Tom &amp; &#39;Jerry&#39; &lt;tag&gt;'
        );
    });

    test('renderHypertextMarkupLanguageReport only renders diff sections for file nodes and omits empty package joins', function () {
        const hypertextMarkupLanguage = renderHypertextMarkupLanguageReport(
            createPreviewDocumentFixture({
                packages: [
                    createDirectoryDiffPreviewPackageFixture({
                        hasChanges: false
                    }),
                    createManifestOnlyPreviewPackageFixture({
                        name: 'package-b',
                        hasChanges: false
                    })
                ]
            })
        );

        assert.ok(!hypertextMarkupLanguage.includes('<summary>source/index.js</summary>'));
        assert.ok(hypertextMarkupLanguage.includes('<span class="badge status-unchanged">unchanged</span>'));
        assert.ok(hypertextMarkupLanguage.includes('package-b'));
        assert.ok(!hypertextMarkupLanguage.includes('Stryker was here'));
    });
});

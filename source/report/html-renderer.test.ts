import assert from 'node:assert';
import { test } from 'mocha';
import type { PreviewDocument } from './preview-document.ts';
import { renderHtmlReport } from './html-renderer.ts';

function documentFactory(overrides: Partial<PreviewDocument> = {}): PreviewDocument {
    return {
        title: 'Packtory preview',
        modeLabel: 'Dry run',
        previewable: true,
        resultType: 'success',
        summary: {
            totalPackages: 1,
            changedPackages: 1,
            unchangedPackages: 0,
            failedPackages: 0,
            emittedArtifacts: 2,
            changedArtifacts: 1,
            eliminatedSourceFiles: 1
        },
        issues: [],
        packages: [
            {
                name: 'pkg-a',
                versionTransition: '1.0.0 -> 1.0.1',
                hasChanges: true,
                openByDefault: true,
                tree: [
                    {
                        path: 'package.json',
                        name: 'package.json',
                        depth: 0,
                        type: 'file',
                        artifact: { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] }
                    },
                    {
                        path: 'src',
                        name: 'src',
                        depth: 0,
                        type: 'directory'
                    },
                    {
                        path: 'src/index.js',
                        name: 'index.js',
                        depth: 1,
                        type: 'file',
                        artifact: {
                            path: 'src/index.js',
                            sizeBytes: 20,
                            kind: 'source',
                            sourcePath: '/workspace/src/index.js',
                            status: 'changed',
                            badges: ['dead-code-elimination'],
                            diff: [
                                {
                                    header: '@@ -1,1 +1,1 @@',
                                    lines: [
                                        { type: 'remove', text: '-export const removed = 1;' },
                                        { type: 'add', text: '+export const kept = 1;' }
                                    ]
                                }
                            ]
                        }
                    }
                ],
                eliminatedSourceFiles: [{ path: '/workspace/src/unused.js', reason: 'not-emitted-after-analysis', sourceBytes: 14 }],
                diagnostics: {
                    decisions: { linker: { rewrites: [] } },
                    outputs: { tarball: { entries: [], totalBytes: 0 } },
                    timings: { publish: 5 }
                }
            }
        ],
        report: {
            schemaVersion: 1,
            generatedAt: '2026-05-11T00:00:00.000Z',
            packages: {
                'pkg-a': {
                    decisions: { linker: { rewrites: [] } },
                    outputs: { tarball: { entries: [], totalBytes: 0 } },
                    timings: { publish: 5 }
                }
            },
            aggregate: { crossBundleLinks: [] }
        },
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

test('renders a doctype and html skeleton', () => {
    const html = renderHtmlReport(documentFactory());

    assert.match(html, /^<!doctype html>/);
    assert.ok(html.includes('<title>Packtory build report</title>'));
});

test('renders summary cards, package sections, tree metadata, and diff hunks', () => {
    const html = renderHtmlReport(documentFactory());

    assert.ok(html.includes('Changed files'));
    assert.ok(html.includes('src/index.js'));
    assert.ok(html.includes('source · 20 B'));
    assert.ok(html.includes('@@ -1,1 +1,1 @@'));
    assert.ok(html.includes('Eliminated source files'));
});

test('opens changed packages by default and collapses unchanged ones', () => {
    const changedHtml = renderHtmlReport(documentFactory());
    const unchangedHtml = renderHtmlReport(
        documentFactory({
            packages: [
                {
                    ...documentFactory().packages[0]!,
                    hasChanges: false,
                    openByDefault: false
                }
            ]
        })
    );

    assert.ok(changedHtml.includes('<details class="package" open>'));
    assert.ok(unchangedHtml.includes('<details class="package">'));
});

test('renders issues and diagnostics sections', () => {
    const html = renderHtmlReport(documentFactory({ issues: ['<bad>'] }));

    assert.ok(html.includes('<h2>Issues</h2>'));
    assert.ok(html.includes('<summary>Diagnostics</summary>') || html.includes('Diagnostics'));
    assert.ok(html.includes('&lt;bad&gt;'));
});

test('embeds the entire BuildReport as escaped JSON in the data script tag', () => {
    const document = documentFactory();
    const html = renderHtmlReport(document);

    const scriptMatch =
        /<script type="application\/json" id="packtory-report-data">(?<encoded>[\s\S]*?)<\/script>/u.exec(html);
    const encoded = scriptMatch?.groups?.encoded;
    if (encoded === undefined) {
        assert.fail('expected packtory-report-data script tag');
    }
    assert.deepStrictEqual(JSON.parse(decodeHtmlEntities(encoded)), document.report);
});

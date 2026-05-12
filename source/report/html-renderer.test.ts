import assert from 'node:assert';
import { test } from 'mocha';
import { renderHtmlReport } from './html-renderer.ts';
import type { BuildReport } from './types.ts';

function baseReport(overrides: Partial<BuildReport> = {}): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-11T00:00:00.000Z',
        packages: {},
        aggregate: { crossBundleLinks: [] },
        ...overrides
    };
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

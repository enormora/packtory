import assert from 'node:assert';
import { test } from 'mocha';
import { htmlReportStyles } from './html-styles.ts';

test('htmlReportStyles declares the light color scheme', () => {
    assert.match(htmlReportStyles, /color-scheme: light;/u);
});

test('htmlReportStyles defines the summary-card style block', () => {
    assert.match(htmlReportStyles, /\.summary-card\s*\{/u);
});

test('htmlReportStyles defines the changed-status badge color', () => {
    assert.match(htmlReportStyles, /\.badge\.status-changed/u);
});

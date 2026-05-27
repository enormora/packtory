import assert from 'node:assert';
import { suite, test } from 'mocha';
import { htmlReportStyles } from './html-styles.ts';

suite('html-styles', function () {
    test('htmlReportStyles declares the light color scheme', function () {
        assert.match(htmlReportStyles(), /color-scheme: light;/u);
    });

    test('htmlReportStyles defines the summary-card style block', function () {
        assert.match(htmlReportStyles(), /\.summary-card\s*\{/u);
    });

    test('htmlReportStyles defines the changed-status badge color', function () {
        assert.match(htmlReportStyles(), /\.badge\.status-changed/u);
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { hypertextMarkupLanguageReportStyles } from './hypertext-markup-language-styles.ts';

suite('html-styles', function () {
    test('hypertextMarkupLanguageReportStyles declares the light color scheme', function () {
        assert.match(hypertextMarkupLanguageReportStyles(), /color-scheme: light;/u);
    });

    test('hypertextMarkupLanguageReportStyles defines the summary-card style block', function () {
        assert.match(hypertextMarkupLanguageReportStyles(), /\.summary-card\s*\{/u);
    });

    test('hypertextMarkupLanguageReportStyles defines the changed-status badge color', function () {
        assert.match(hypertextMarkupLanguageReportStyles(), /\.badge\.status-changed/u);
    });
});

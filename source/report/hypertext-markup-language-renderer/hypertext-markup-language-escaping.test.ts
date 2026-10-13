import assert from 'node:assert';
import { suite, test } from 'mocha';
import { escapeHypertextMarkupLanguage } from './hypertext-markup-language-escaping.ts';

suite('html-escaping', function () {
    test('escapeHypertextMarkupLanguage returns plain text unchanged when no special characters are present', function () {
        assert.strictEqual(escapeHypertextMarkupLanguage('hello world'), 'hello world');
    });

    test('escapeHypertextMarkupLanguage escapes ampersand before any other character', function () {
        assert.strictEqual(escapeHypertextMarkupLanguage('A & B'), 'A &amp; B');
    });

    test('escapeHypertextMarkupLanguage escapes less-than and greater-than characters', function () {
        assert.strictEqual(escapeHypertextMarkupLanguage('<tag>'), '&lt;tag&gt;');
    });

    test('escapeHypertextMarkupLanguage escapes double quotes and single quotes', function () {
        assert.strictEqual(escapeHypertextMarkupLanguage('"hello" \'world\''), '&quot;hello&quot; &#39;world&#39;');
    });

    test('escapeHypertextMarkupLanguage escapes every occurrence of a special character', function () {
        assert.strictEqual(escapeHypertextMarkupLanguage('<<>>'), '&lt;&lt;&gt;&gt;');
    });

    test('escapeHypertextMarkupLanguage does not double-escape an existing entity-like substring', function () {
        assert.strictEqual(escapeHypertextMarkupLanguage('&amp;'), '&amp;amp;');
    });
});

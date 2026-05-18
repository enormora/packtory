import assert from 'node:assert';
import { test } from 'mocha';
import { escapeHtml } from './html-escaping.ts';

test('escapeHtml returns plain text unchanged when no special characters are present', () => {
    assert.strictEqual(escapeHtml('hello world'), 'hello world');
});

test('escapeHtml escapes ampersand before any other character', () => {
    assert.strictEqual(escapeHtml('A & B'), 'A &amp; B');
});

test('escapeHtml escapes less-than and greater-than characters', () => {
    assert.strictEqual(escapeHtml('<tag>'), '&lt;tag&gt;');
});

test('escapeHtml escapes double quotes and single quotes', () => {
    assert.strictEqual(escapeHtml('"hello" \'world\''), '&quot;hello&quot; &#39;world&#39;');
});

test('escapeHtml escapes every occurrence of a special character', () => {
    assert.strictEqual(escapeHtml('<<>>'), '&lt;&lt;&gt;&gt;');
});

test('escapeHtml does not double-escape an existing entity-like substring', () => {
    assert.strictEqual(escapeHtml('&amp;'), '&amp;amp;');
});

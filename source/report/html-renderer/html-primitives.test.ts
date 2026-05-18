import assert from 'node:assert';
import { test } from 'mocha';
import {
    formatBytes,
    renderBadge,
    renderCollapsibleSection,
    renderIssuesSection,
    renderSummaryCard,
    serializeJsonBlock
} from './html-primitives.ts';

test('formatBytes appends the unit suffix to the byte count', () => {
    assert.strictEqual(formatBytes(0), '0 B');
});

test('formatBytes preserves the numeric value verbatim', () => {
    assert.strictEqual(formatBytes(1024), '1024 B');
});

test('renderBadge wraps the label in a span with the merged class name', () => {
    assert.strictEqual(renderBadge('changed', 'status-changed'), '<span class="badge status-changed">changed</span>');
});

test('renderBadge escapes HTML in the label', () => {
    assert.strictEqual(renderBadge('<bad>', 'secondary'), '<span class="badge secondary">&lt;bad&gt;</span>');
});

test('renderSummaryCard renders a card with the label and value', () => {
    assert.strictEqual(
        renderSummaryCard('Packages', 3),
        '<div class="summary-card"><span class="summary-label">Packages</span><strong>3</strong></div>'
    );
});

test('renderIssuesSection wraps the supplied list items in an Issues section', () => {
    assert.strictEqual(
        renderIssuesSection('<li>boom</li>'),
        '<section class="issues"><h2>Issues</h2><ul><li>boom</li></ul></section>'
    );
});

test('serializeJsonBlock returns a stable two-space indented JSON string', () => {
    assert.strictEqual(serializeJsonBlock({ a: 1, b: [2, 3] }), '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
});

test('renderCollapsibleSection wraps the JSON-encoded value in an escaped <pre> inside <details>', () => {
    assert.strictEqual(
        renderCollapsibleSection('Inputs', { foo: 'bar' }),
        '<details class="diagnostic secondary"><summary>Inputs</summary><pre>{\n  &quot;foo&quot;: &quot;bar&quot;\n}</pre></details>'
    );
});

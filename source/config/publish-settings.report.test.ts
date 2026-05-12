import assert from 'node:assert';
import { test } from 'mocha';
import type { PublishSettings } from './publish-settings.ts';
import { redactPublishSettings } from './publish-settings.report.ts';

test('emits provenance file path but marks it not inlined', () => {
    const settings: PublishSettings = {
        access: 'public',
        provenance: { type: 'file', path: '/abs/path/to/sbom.json' }
    };

    const redacted = redactPublishSettings(settings);

    assert.deepStrictEqual(redacted, {
        access: 'public',
        provenance: { type: 'file', path: '/abs/path/to/sbom.json', inlined: false }
    });
});

test('preserves auto provenance', () => {
    const settings: PublishSettings = { access: 'public', provenance: { type: 'auto' } };

    const redacted = redactPublishSettings(settings);

    assert.deepStrictEqual(redacted, {
        access: 'public',
        provenance: { type: 'auto' }
    });
});

test('emits allowScripts when present', () => {
    const settings: PublishSettings = { access: 'restricted', allowScripts: true };

    const redacted = redactPublishSettings(settings);

    assert.deepStrictEqual(redacted, { access: 'restricted', allowScripts: true });
});

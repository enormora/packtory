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

test('omits allowScripts when absent', () => {
    const settings: PublishSettings = { access: 'restricted' };

    const redacted = redactPublishSettings(settings);

    assert.strictEqual('allowScripts' in redacted, false);
});

test('emits sbom verbatim when present', () => {
    const sbom = { enabled: true };
    const settings: PublishSettings = { access: 'public', sbom };

    const redacted = redactPublishSettings(settings);

    assert.deepStrictEqual(redacted.sbom, sbom);
});

test('omits sbom when absent', () => {
    const settings: PublishSettings = { access: 'public' };

    const redacted = redactPublishSettings(settings);

    assert.strictEqual('sbom' in redacted, false);
});

test('omits provenance when access is public but provenance is undefined', () => {
    const settings: PublishSettings = { access: 'public' };

    const redacted = redactPublishSettings(settings);

    assert.strictEqual('provenance' in redacted, false);
});

test('does not emit provenance for restricted access even when carried alongside', () => {
    const settings = {
        access: 'restricted',
        provenance: { type: 'auto' }
    } as unknown as PublishSettings;

    const redacted = redactPublishSettings(settings);

    assert.strictEqual('provenance' in redacted, false);
});

test('preserves access verbatim', () => {
    const publicRedacted = redactPublishSettings({ access: 'public' });
    const restrictedRedacted = redactPublishSettings({ access: 'restricted' });

    assert.strictEqual(publicRedacted.access, 'public');
    assert.strictEqual(restrictedRedacted.access, 'restricted');
});

test('emits allowScripts together with provenance when both are set on public access', () => {
    const settings: PublishSettings = {
        access: 'public',
        allowScripts: false,
        provenance: { type: 'auto' }
    };

    const redacted = redactPublishSettings(settings);

    assert.deepStrictEqual(redacted, {
        access: 'public',
        allowScripts: false,
        provenance: { type: 'auto' }
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PublishSettings } from './publish-settings.ts';
import { redactPublishSettings } from './publish-settings.report.ts';

suite('publish-settings.report', function () {
    test('emits provenance file path but marks it not inlined', function () {
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

    test('preserves auto provenance', function () {
        const settings: PublishSettings = { access: 'public', provenance: { type: 'auto' } };

        const redacted = redactPublishSettings(settings);

        assert.deepStrictEqual(redacted, {
            access: 'public',
            provenance: { type: 'auto' }
        });
    });

    test('emits allowScripts when present', function () {
        const settings: PublishSettings = { access: 'restricted', allowScripts: true };

        const redacted = redactPublishSettings(settings);

        assert.deepStrictEqual(redacted, { access: 'restricted', allowScripts: true });
    });

    test('omits allowScripts when absent', function () {
        const settings: PublishSettings = { access: 'restricted' };

        const redacted = redactPublishSettings(settings);

        assert.strictEqual(Object.hasOwn(redacted, 'allowScripts'), false);
    });

    test('emits sbom verbatim when present', function () {
        const sbom = { enabled: true };
        const settings: PublishSettings = { access: 'public', sbom };

        const redacted = redactPublishSettings(settings);

        assert.deepStrictEqual(redacted.sbom, sbom);
    });

    test('omits sbom when absent', function () {
        const settings: PublishSettings = { access: 'public' };

        const redacted = redactPublishSettings(settings);

        assert.strictEqual(Object.hasOwn(redacted, 'sbom'), false);
    });

    test('omits provenance when access is public but provenance is undefined', function () {
        const settings: PublishSettings = { access: 'public' };

        const redacted = redactPublishSettings(settings);

        assert.strictEqual(Object.hasOwn(redacted, 'provenance'), false);
    });

    test('does not emit provenance for restricted access even when carried alongside', function () {
        const settings = {
            access: 'restricted',
            provenance: { type: 'auto' }
        } as unknown as PublishSettings;

        const redacted = redactPublishSettings(settings);

        assert.strictEqual(Object.hasOwn(redacted, 'provenance'), false);
    });

    test('preserves access verbatim', function () {
        const publicRedacted = redactPublishSettings({ access: 'public' });
        const restrictedRedacted = redactPublishSettings({ access: 'restricted' });

        assert.strictEqual(publicRedacted.access, 'public');
        assert.strictEqual(restrictedRedacted.access, 'restricted');
    });

    test('emits allowScripts together with provenance when both are set on public access', function () {
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
});

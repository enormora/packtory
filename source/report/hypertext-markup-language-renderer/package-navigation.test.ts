import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createPreviewDocumentFixture, createPreviewPackageFixture } from '../../test-libraries/preview-fixtures.ts';
import { renderPackageNavigation, packageNavigationStyles } from './package-navigation.ts';

suite('package navigation', function () {
    test('selects failures before transformed packages and orders names deterministically', function () {
        const document = createPreviewDocumentFixture({
            packages: [
                createPreviewPackageFixture({ name: 'z-transformed' }),
                createPreviewPackageFixture({ name: 'a-failed', failure: { stage: 'build', message: 'boom' } })
            ]
        });
        const markup = renderPackageNavigation(document);
        assert.ok(markup.includes('id="package-0" checked'));
        assert.ok(markup.includes('a-failed (failed)'));
        assert.ok(markup.includes('<span class="package-option"><input class="package-choice"'));
        assert.ok(markup.includes('</label></span>'));
        assert.ok(markup.indexOf('a-failed') < markup.indexOf('z-transformed'));
        assert.ok(markup.includes('.packages:has(#package-0:checked) .package-panel-0'));
    });

    test('honors selected packages, escapes labels, and enables all files', function () {
        const markup = renderPackageNavigation(
            createPreviewDocumentFixture({
                selectedPackage: 'z<&',
                allFiles: true,
                packages: [
                    createPreviewPackageFixture({ name: 'a', hasChanges: false }),
                    createPreviewPackageFixture({ name: 'z<&' })
                ]
            })
        );
        assert.ok(markup.includes('id="package-1" checked'));
        assert.ok(markup.includes('z&lt;&amp;'));
        assert.ok(markup.includes('id="all-files" type="checkbox" checked'));
        assert.ok(!markup.includes('<label for="package-1">z<&'));
    });

    test('handles empty and unchanged runs and supplies responsive keyboard styles', function () {
        const empty = renderPackageNavigation(createPreviewDocumentFixture({ packages: [] }));
        const unchanged = renderPackageNavigation(
            createPreviewDocumentFixture({
                packages: [ createPreviewPackageFixture({ hasChanges: false, openByDefault: false }) ]
            })
        );
        assert.ok(!empty.includes('id="package-0"'));
        assert.ok(unchanged.includes('id="package-0" checked'));
        assert.ok(packageNavigationStyles().includes(':focus-visible'));
        assert.ok(packageNavigationStyles().includes('@media (max-width: 700px)'));
    });
});

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createPreviewDocumentFixture, createPreviewPackageFixture } from '../../test-libraries/preview-fixtures.ts';
import { renderPackageNavigation } from './package-navigation.ts';

function checkedPackages(markup: string): readonly string[] {
    return Array.from(
        markup.matchAll(/<input class="package-choice"[^>]*id="(?<packageIdentifier>[^"]+)" checked>/gu),
        function (match) {
            return match.groups?.packageIdentifier ?? '';
        }
    );
}

suite('package selection priority', function () {
    const unchanged = createPreviewPackageFixture({ name: 'a', hasChanges: false });
    const transformed = createPreviewPackageFixture({ name: 'b', hasChanges: true });
    const failed = createPreviewPackageFixture({
        name: 'z',
        hasChanges: false,
        failure: { stage: 'build', message: 'boom' }
    });

    test('checks exactly one package and prioritizes failures over changes and alphabetical order', function () {
        const markup = renderPackageNavigation(
            createPreviewDocumentFixture({ packages: [ unchanged, transformed, failed ] })
        );
        assert.deepStrictEqual(checkedPackages(markup), [ 'package-2' ]);
        assert.ok(markup.includes('<label for="package-0">a</label>'));
        assert.ok(markup.includes('<label for="package-1">b</label>'));
        assert.ok(markup.includes('<label for="package-2">z (failed)</label>'));
        assert.ok(markup.includes('id="all-files" type="checkbox">'));
    });

    test('selects the first transformed package when there are no failures', function () {
        const markup = renderPackageNavigation(createPreviewDocumentFixture({ packages: [ unchanged, transformed ] }));
        assert.deepStrictEqual(checkedPackages(markup), [ 'package-1' ]);
    });
});

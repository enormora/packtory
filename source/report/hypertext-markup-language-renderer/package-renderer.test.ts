import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PreviewPackage } from '../preview/preview-document.ts';
import { renderPackage } from './package-renderer.ts';

const emptyDiagnostics: PreviewPackage['diagnostics'] = {
    decisions: {},
    timings: {}
};

function minimalPackage(overrides: Partial<PreviewPackage> = {}): PreviewPackage {
    return {
        name: 'package-a',
        hasChanges: false,
        openByDefault: false,
        tree: [],
        changedArtifacts: [],
        artifactCounts: { emitted: 0, changed: 0 },
        eliminatedSourceFiles: [],
        diagnostics: emptyDiagnostics,
        ...overrides
    };
}

suite('package-renderer', function () {
    test('renderPackage marks the changed badge when the package has changes', function () {
        const hypertextMarkupLanguage = renderPackage(minimalPackage({ hasChanges: true, openByDefault: true }));

        assert.ok(hypertextMarkupLanguage.includes('<details class="package" open>'));
        assert.ok(hypertextMarkupLanguage.includes('<span class="badge status-changed">changed</span>'));
    });

    test('renderPackage marks the unchanged badge when the package has no changes', function () {
        const hypertextMarkupLanguage = renderPackage(minimalPackage({ hasChanges: false }));

        assert.ok(hypertextMarkupLanguage.includes('<span class="badge status-unchanged">unchanged</span>'));
    });

    test('renderPackage renders the version transition badge when supplied', function () {
        const hypertextMarkupLanguage = renderPackage(minimalPackage({ versionTransition: '1.0.0 -> 1.0.1' }));

        assert.ok(hypertextMarkupLanguage.includes('<span class="badge secondary">1.0.0 -&gt; 1.0.1</span>'));
    });

    test('renderPackage renders the failure banner when the package has a failure', function () {
        const hypertextMarkupLanguage = renderPackage(
            minimalPackage({ failure: { stage: 'publish', message: 'boom' } })
        );

        assert.ok(hypertextMarkupLanguage.includes('Failed in stage <strong>publish</strong>: boom'));
    });

    test('renderPackage omits the Changed files section when the tree contains no diffs', function () {
        const hypertextMarkupLanguage = renderPackage(minimalPackage());

        assert.ok(!hypertextMarkupLanguage.includes('<h3>Changed files</h3>'));
    });

    test('renderPackage omits the Eliminated source files section when none are present', function () {
        const hypertextMarkupLanguage = renderPackage(minimalPackage());

        assert.ok(!hypertextMarkupLanguage.includes('Eliminated source files'));
    });

    test('renderPackage omits the Diagnostics section when every diagnostic group is empty', function () {
        const hypertextMarkupLanguage = renderPackage(minimalPackage());

        assert.ok(!hypertextMarkupLanguage.includes('Diagnostics'));
    });

    test('renderPackage escapes special characters in the package name', function () {
        const hypertextMarkupLanguage = renderPackage(minimalPackage({ name: '<scary>' }));

        assert.ok(hypertextMarkupLanguage.includes('<span class="package-title">&lt;scary&gt;</span>'));
    });
});

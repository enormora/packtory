import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ChangedPreviewArtifact, PreviewPackage } from '../preview/preview-document.ts';
import { renderPackageDiffs } from './diff-renderer.ts';

function changedArtifact(path: string, overrides: Partial<ChangedPreviewArtifact> = {}): ChangedPreviewArtifact {
    return {
        path,
        sizeBytes: 0,
        kind: 'source',
        sourcePath: `/source/${path}`,
        status: 'changed',
        badges: [],
        diff: [],
        ...overrides
    };
}

function packageWithChangedArtifacts(
    changedArtifacts: readonly ChangedPreviewArtifact[]
): Pick<PreviewPackage, 'changedArtifacts'> {
    return { changedArtifacts };
}

suite('diff-renderer', function () {
    test('renderPackageDiffs renders a Changed files section when at least one file has a diff', function () {
        const hypertextMarkupLanguage = renderPackageDiffs(
            packageWithChangedArtifacts([
                changedArtifact('source/a.js', {
                    diff: [
                        {
                            header: '@@ -1,1 +1,1 @@',
                            lines: [
                                { type: 'remove', text: '-old' },
                                { type: 'add', text: '+new' }
                            ]
                        }
                    ]
                })
            ]) as PreviewPackage
        );

        assert.ok(hypertextMarkupLanguage.includes('<h3>Changed files</h3>'));
        assert.ok(hypertextMarkupLanguage.includes('<summary>source/a.js</summary>'));
        assert.ok(hypertextMarkupLanguage.includes('@@ -1,1 +1,1 @@'));
        assert.ok(hypertextMarkupLanguage.includes('<div class="diff-line remove">-old</div>'));
        assert.ok(hypertextMarkupLanguage.includes('<div class="diff-line add">+new</div>'));
    });

    test('renderPackageDiffs returns an empty string when the precomputed diff list is empty', function () {
        assert.strictEqual(renderPackageDiffs(packageWithChangedArtifacts([]) as PreviewPackage), '');
    });
});

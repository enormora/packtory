import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createManifestOnlyPreviewPackageFixture,
    createPreviewPackageFixture
} from '../../test-libraries/preview-fixtures.ts';
import { renderPackage } from './terminal-package-renderer.ts';
import { createColors } from './terminal-preview-renderer-shared.ts';

function colors() {
    return createColors(false);
}

suite('terminal-package-renderer', function () {
    test('renderPackage renders the name, version transition, tree, eliminated files, and diffs', function () {
        const output = renderPackage(createPreviewPackageFixture(), colors());

        assert.strictEqual(
            output,
            [
                'pkg-a 1.0.0 -> 1.0.1',
                '  • package.json (manifest, 2 B) [generated]',
                '  ▸ src/',
                '    • src/index.js (source, 20 B) [changed, DCE]',
                '  Eliminated source files',
                '    - /workspace/src/unused.js (14 B)',
                '  Diffs',
                '    src/index.js',
                '      @@ -1,1 +1,1 @@',
                '      -export const removed = 1;',
                '      +export const kept = 1;'
            ].join('\n')
        );
    });

    test('renderPackage omits the version transition when it is undefined', function () {
        const output = renderPackage(createPreviewPackageFixture({ versionTransition: undefined }), colors());

        assert.ok(output.startsWith('pkg-a\n'));
        assert.ok(!output.includes('undefined'));
    });

    test('renderPackage prepends a failure line when the package has a failure', function () {
        const output = renderPackage(
            createPreviewPackageFixture({ failure: { stage: 'publish', message: 'boom' } }),
            colors()
        );

        assert.ok(output.includes('failure publish: boom'));
    });

    test('renderPackage omits the diffs and eliminated-files sections when both are absent', function () {
        const output = renderPackage(createManifestOnlyPreviewPackageFixture(), colors());

        assert.ok(!output.includes('Diffs'));
        assert.ok(!output.includes('Eliminated source files'));
    });
});

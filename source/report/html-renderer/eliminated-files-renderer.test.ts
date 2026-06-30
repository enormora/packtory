import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PreviewPackage } from '../preview/preview-document.ts';
import { renderEliminatedFiles } from './eliminated-files-renderer.ts';

function previewPackage(
    eliminatedSourceFiles: PreviewPackage['eliminatedSourceFiles']
): Pick<PreviewPackage, 'eliminatedSourceFiles'> {
    return { eliminatedSourceFiles };
}

suite('eliminated-files-renderer', function () {
    test('renderEliminatedFiles returns an empty string when the package has no eliminated files', function () {
        assert.strictEqual(renderEliminatedFiles(previewPackage([]) as PreviewPackage), '');
    });

    test('renderEliminatedFiles renders a single eliminated source file with formatted bytes', function () {
        const html = renderEliminatedFiles(
            previewPackage([ { path: '/src/dead.js', sourceBytes: 42, reason: 'no-uses' } ]) as PreviewPackage
        );

        assert.ok(html.includes('<h3>Eliminated source files</h3>'));
        assert.ok(html.includes('<code>/src/dead.js</code>'));
        assert.ok(html.includes('42 B'));
    });

    test('renderEliminatedFiles renders multiple eliminated source files in order', function () {
        const html = renderEliminatedFiles(
            previewPackage([
                { path: '/src/a.js', sourceBytes: 10, reason: 'no-uses' },
                { path: '/src/b.js', sourceBytes: 20, reason: 'no-uses' }
            ]) as PreviewPackage
        );

        const positionOfA = html.indexOf('/src/a.js');
        const positionOfB = html.indexOf('/src/b.js');
        assert.ok(positionOfA !== -1 && positionOfB > positionOfA);
    });
});

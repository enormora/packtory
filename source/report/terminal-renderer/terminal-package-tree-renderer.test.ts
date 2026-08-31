import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageTree } from '../../packtory/packtory-results.ts';
import { renderTerminalPackageTree } from './terminal-package-tree-renderer.ts';

suite('terminal-package-tree-renderer', function () {
    test('renderTerminalPackageTree renders the package header and artifact tree metadata', function () {
        const tree: PackageTree = {
            packageName: 'pkg-a',
            entries: [
                { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] },
                {
                    path: 'src/index.js',
                    sizeBytes: 20,
                    kind: 'source',
                    status: 'changed',
                    badges: [ 'dead-code-elimination' ],
                    sourcePath: '/workspace/src/index.js'
                }
            ]
        };

        const output = renderTerminalPackageTree(tree, { color: false });

        assert.strictEqual(
            output,
            [
                'pkg-a',
                '  • package.json (manifest, 2 B) [generated]',
                '    ▸ src/',
                '    • src/index.js (source, 20 B) [changed, dead code elimination]',
                ''
            ]
                .join('\n')
        );
    });

    test('renderTerminalPackageTree renders an empty tree as only the package header', function () {
        assert.strictEqual(
            renderTerminalPackageTree({ packageName: 'pkg-a', entries: [] }, { color: false }),
            'pkg-a\n'
        );
    });
});

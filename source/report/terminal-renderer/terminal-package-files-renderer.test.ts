import assert from 'node:assert';
import { suite, test } from 'mocha';
import { renderTerminalPackageFiles } from './terminal-package-files-renderer.ts';

suite('terminal package files renderer', function () {
    test('renders discovery chains, generated files, and unavailable paths', function () {
        assert.strictEqual(
            renderTerminalPackageFiles({
                packageName: 'example',
                files: [
                    {
                        packagePath: './leaf.js',
                        sourcePath: 'source/leaf.js',
                        kind: 'file',
                        discovery: {
                            type: 'discovered',
                            chain: [
                                { packagePath: './index.js', sourcePath: 'source/index.js', via: 'root' },
                                { packagePath: './leaf.js', sourcePath: 'source/leaf.js', via: 'import' }
                            ]
                        }
                    },
                    {
                        packagePath: './package.json',
                        sourcePath: undefined,
                        kind: 'generated-manifest',
                        discovery: { type: 'unavailable', reason: 'no-discovery-path' }
                    }
                ]
            }),
            [
                'Packtory files [Dry run]',
                'example',
                'Source discovery before dead-code elimination; not a symbol retention explanation.',
                '  ./leaf.js (source/leaf.js)',
                '    root: ./index.js',
                '    import: ./leaf.js',
                '  ./package.json (generated manifest)',
                '    Discovery chain unavailable',
                ''
            ]
                .join('\n')
        );
    });

    test('renders an empty package', function () {
        assert.strictEqual(
            renderTerminalPackageFiles({ packageName: 'empty', files: [] }),
            [
                'Packtory files [Dry run]',
                'empty',
                'Source discovery before dead-code elimination; not a symbol retention explanation.',
                'No retained files.',
                ''
            ]
                .join('\n')
        );
    });
});

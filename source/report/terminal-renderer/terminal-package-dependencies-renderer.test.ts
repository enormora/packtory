import assert from 'node:assert';
import { suite, test } from 'mocha';
import { renderTerminalPackageDependencies } from './terminal-package-dependencies-renderer.ts';

suite('terminal-package-dependencies-renderer', function () {
    test('renders dependency groups, unresolved entries, rewritten specifiers, and empty results', function () {
        assert.strictEqual(
            renderTerminalPackageDependencies({
                packageName: 'pkg-a',
                dependencies: []
            }),
            'Packtory dependency reasons [Dry run]\npkg-a\nNo dependencies.\n'
        );

        assert.strictEqual(
            renderTerminalPackageDependencies({
                packageName: 'pkg-a',
                dependencies: [
                    {
                        name: 'react',
                        origin: 'external',
                        manifest: {
                            type: 'invalid-version',
                            group: 'dependencies',
                            version: 'workspace:*',
                            message: 'bad'
                        },
                        references: [
                            {
                                sourcePath: 'src/index.js',
                                sourceSpecifier: 'react/jsx-runtime',
                                emittedSpecifier: 'react/jsx-runtime'
                            }
                        ]
                    },
                    {
                        name: 'peer',
                        origin: 'bundle-peer',
                        manifest: { type: 'emitted', group: 'peerDependencies', version: '0.0.0' },
                        references: [
                            {
                                sourcePath: 'src/index.js',
                                sourceSpecifier: './peer.js',
                                emittedSpecifier: 'peer'
                            }
                        ]
                    },
                    {
                        name: 'missing',
                        origin: 'external',
                        manifest: { type: 'missing-version' },
                        references: [
                            {
                                sourcePath: 'src/missing.js',
                                sourceSpecifier: 'missing',
                                emittedSpecifier: 'missing'
                            }
                        ]
                    }
                ]
            }),
            [
                'Packtory dependency reasons [Dry run]',
                'pkg-a',
                'dependencies',
                '  react workspace:* invalid: bad (external)',
                '    src/index.js: react/jsx-runtime',
                'peerDependencies',
                '  peer 0.0.0 (bundle-peer)',
                '    src/index.js: ./peer.js -> peer',
                'unresolved',
                '  missing missing version (external)',
                '    src/missing.js: missing',
                ''
            ]
                .join('\n')
        );
    });
});

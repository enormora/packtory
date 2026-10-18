import assert from 'node:assert';
import { suite, test } from 'mocha';
import { renderTerminalPackageDependencies } from './terminal-package-dependencies-renderer.ts';

suite('terminal-package-dependencies-renderer', function () {
    test('renders dependency groups, unresolved entries, rewritten specifiers, and empty results', function () {
        assert.strictEqual(
            renderTerminalPackageDependencies({
                packageName: 'package-a',
                dependencies: []
            }, { color: false }),
            'Packtory dependency reasons [Dry run]\npackage-a\nNo dependencies.\n'
        );

        assert.strictEqual(
            renderTerminalPackageDependencies({
                packageName: 'package-a',
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
                                sourcePath: 'source/index.js',
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
                                sourcePath: 'source/index.js',
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
                                sourcePath: 'source/missing.js',
                                sourceSpecifier: 'missing',
                                emittedSpecifier: 'missing'
                            }
                        ]
                    }
                ]
            }, { color: false }),
            [
                'Packtory dependency reasons [Dry run]',
                'package-a',
                'dependencies',
                '  react workspace:* invalid: bad (external)',
                '    source/index.js: react/jsx-runtime',
                'peerDependencies',
                '  peer 0.0.0 (bundle-peer)',
                '    source/index.js: ./peer.js -> peer',
                'unresolved',
                '  missing missing version (external)',
                '    source/missing.js: missing',
                ''
            ]
                .join('\n')
        );
    });
});

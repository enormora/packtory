import assert from 'node:assert';
import { suite, test } from 'mocha';
import { renderTerminalPackageSideEffects } from './terminal-package-side-effects-renderer.ts';

suite('terminal-package-side-effects-renderer', function () {
    test('renders pure packages', function () {
        assert.strictEqual(
            renderTerminalPackageSideEffects({
                packageName: 'package-a',
                packageManifestDecision: { type: 'side-effects-false' },
                impureFiles: []
            }, { color: false }),
            [
                'Packtory side effects [Dry run]',
                'package-a',
                'Generated package.json sideEffects: false',
                'No runtime side effects.',
                ''
            ]
                .join('\n')
        );
    });

    test('renders listed and omitted side effects with findings', function () {
        assert.strictEqual(
            renderTerminalPackageSideEffects({
                packageName: 'package-a',
                packageManifestDecision: { type: 'side-effects-list', paths: [ './setup.js' ] },
                impureFiles: [
                    {
                        sourcePath: 'package-a/setup.ts',
                        packagePath: './setup.js',
                        statements: [
                            { line: 1, kind: 'expression statement' },
                            { line: 3, kind: 'variable initializer' }
                        ]
                    }
                ]
            }, { color: false }),
            [
                'Packtory side effects [Dry run]',
                'package-a',
                'Generated package.json sideEffects: ["./setup.js"]',
                'Runtime side effects',
                '  ./setup.js (package-a/setup.ts)',
                '    line 1: expression statement',
                '    line 3: variable initializer',
                ''
            ]
                .join('\n')
        );

        assert.match(
            renderTerminalPackageSideEffects({
                packageName: 'package-a',
                packageManifestDecision: {
                    type: 'side-effects-omitted',
                    reason: 'every-runtime-file-has-side-effects'
                },
                impureFiles: []
            }, { color: false }),
            /Generated package\.json sideEffects: omitted \(every runtime file has side effects\)/u
        );
    });

    test('renders user-provided sideEffects and the generated decision', function () {
        assert.strictEqual(
            renderTerminalPackageSideEffects({
                packageName: 'package-a',
                packageManifestDecision: {
                    type: 'user-provided-side-effects',
                    providedValue: [ './manual.js' ],
                    generated: { type: 'side-effects-false' }
                },
                impureFiles: []
            }, { color: false }),
            [
                'Packtory side effects [Dry run]',
                'package-a',
                'package.json sideEffects: user-provided ["./manual.js"]',
                'Generated package.json sideEffects without override: false',
                'No runtime side effects.',
                ''
            ]
                .join('\n')
        );
    });
});

import assert from 'node:assert';
import { test } from 'mocha';
import type { PreviewDocument } from './preview-document.ts';
import { renderFailureOnlyTerminalPreview, renderTerminalPreview } from './terminal-preview-renderer.ts';

function documentFactory(overrides: Partial<PreviewDocument> = {}): PreviewDocument {
    return {
        title: 'Packtory preview',
        modeLabel: 'Dry run',
        previewable: true,
        resultType: 'success',
        summary: {
            totalPackages: 1,
            changedPackages: 1,
            unchangedPackages: 0,
            failedPackages: 0,
            emittedArtifacts: 2,
            changedArtifacts: 1,
            eliminatedSourceFiles: 1
        },
        issues: [],
        packages: [
            {
                name: 'pkg-a',
                versionTransition: '1.0.0 -> 1.0.1',
                hasChanges: true,
                openByDefault: true,
                tree: [
                    {
                        path: 'package.json',
                        name: 'package.json',
                        depth: 0,
                        type: 'file',
                        artifact: { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] }
                    },
                    {
                        path: 'src',
                        name: 'src',
                        depth: 0,
                        type: 'directory'
                    },
                    {
                        path: 'src/index.js',
                        name: 'index.js',
                        depth: 1,
                        type: 'file',
                        artifact: {
                            path: 'src/index.js',
                            sizeBytes: 20,
                            kind: 'source',
                            sourcePath: '/workspace/src/index.js',
                            status: 'changed',
                            badges: ['dead-code-elimination'],
                            diff: [
                                {
                                    header: '@@ -1,1 +1,1 @@',
                                    lines: [
                                        { type: 'remove', text: '-old();' },
                                        { type: 'add', text: '+new();' }
                                    ]
                                }
                            ]
                        }
                    }
                ],
                eliminatedSourceFiles: [{ path: '/workspace/src/unused.js', reason: 'not-emitted-after-analysis', sourceBytes: 14 }],
                diagnostics: { decisions: {}, timings: {} }
            }
        ],
        report: {
            schemaVersion: 1,
            generatedAt: '2026-05-11T00:00:00.000Z',
            packages: { 'pkg-a': { decisions: {}, timings: {} } },
            aggregate: { crossBundleLinks: [] }
        },
        ...overrides
    };
}

test('renderTerminalPreview renders the full tree with metadata, badges, and diffs', () => {
    const output = renderTerminalPreview(documentFactory(), { color: false });

    assert.ok(output.includes('Packtory preview [Dry run]'));
    assert.ok(output.includes('• package.json (manifest, 2 B) [generated]'));
    assert.ok(output.includes('▸ src/'));
    assert.ok(output.includes('• src/index.js (source, 20 B) [changed, DCE]'));
    assert.ok(output.includes('@@ -1,1 +1,1 @@'));
    assert.ok(output.includes('Eliminated source files'));
});

test('renderFailureOnlyTerminalPreview renders issues and package failures for failure-only runs', () => {
    const output = renderFailureOnlyTerminalPreview(
        documentFactory({
            previewable: false,
            resultType: 'checks',
            issues: ['bundle is too large'],
            packages: [
                {
                    ...documentFactory().packages[0]!,
                    failure: { stage: 'resolveAndLink', message: 'boom' }
                }
            ]
        }),
        { color: false }
    );

    assert.ok(output.includes('Check failures'));
    assert.ok(output.includes('- bundle is too large'));
    assert.ok(output.includes('pkg-a resolveAndLink: boom'));
});

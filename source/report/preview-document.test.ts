import assert from 'node:assert';
import { test } from 'mocha';
import { Result } from 'true-myth';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import { buildPreviewDocument } from './preview-document.ts';
import type { BuildReport } from './report-aggregator.ts';

function buildResult(overrides: Partial<BuildAndPublishResult> = {}): BuildAndPublishResult {
    return {
        status: 'new-version',
        bundle: versionedBundleWithManifest({
            name: 'pkg-a',
            version: '1.0.1',
            manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false },
            packageJson: { name: 'pkg-a', version: '1.0.1' },
            contents: [
                {
                    fileDescription: {
                        sourceFilePath: '/workspace/src/index.js',
                        targetFilePath: 'src/index.js',
                        content: 'export const kept = 1;\n',
                        isExecutable: false
                    },
                    directDependencies: new Set<string>(),
                    isExplicitlyIncluded: false,
                    isSubstituted: false,
                    analysis: {
                        survivingBindings: new Set<string>(),
                        sideEffectStatements: [],
                        sideEffectImports: new Set<string>()
                    }
                },
                {
                    fileDescription: {
                        sourceFilePath: '/workspace/src/index.js.map',
                        targetFilePath: 'src/index.js.map',
                        content: '{"version":3}',
                        isExecutable: false
                    },
                    directDependencies: new Set<string>(),
                    isExplicitlyIncluded: false,
                    isSubstituted: false,
                    analysis: {
                        survivingBindings: new Set<string>(),
                        sideEffectStatements: [],
                        sideEffectImports: new Set<string>()
                    }
                },
                {
                    fileDescription: {
                        sourceFilePath: '/workspace/types/index.d.ts',
                        targetFilePath: 'types/index.d.ts',
                        content: 'export declare const kept: number;\n',
                        isExecutable: false
                    },
                    directDependencies: new Set<string>(),
                    isExplicitlyIncluded: false,
                    isSubstituted: false,
                    analysis: {
                        survivingBindings: new Set<string>(),
                        sideEffectStatements: [],
                        sideEffectImports: new Set<string>()
                    }
                }
            ]
        }),
        ...overrides
    };
}

function baseReport(): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-11T00:00:00.000Z',
        packages: {
            'pkg-a': {
                decisions: {
                    version: {
                        previousVersion: '1.0.0',
                        chosenVersion: '1.0.1',
                        trigger: 'auto-patch-bump'
                    }
                },
                outputs: {
                    tarball: {
                        totalBytes: 123,
                        entries: [
                            { path: 'src/index.js', sizeBytes: 22, kind: 'source', sourcePath: '/workspace/src/index.js', status: 'changed', badges: ['dead-code-elimination'] },
                            { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] },
                            { path: 'src/index.js.map', sizeBytes: 13, kind: 'source', sourcePath: '/workspace/src/index.js.map', status: 'changed', badges: ['dead-code-elimination'] },
                            { path: 'types/index.d.ts', sizeBytes: 35, kind: 'source', sourcePath: '/workspace/types/index.d.ts', status: 'unchanged', badges: [] }
                        ]
                    }
                },
                eliminatedSourceFiles: [{ path: '/workspace/src/unused.js', reason: 'not-emitted-after-analysis', sourceBytes: 14 }],
                timings: {}
            },
            'pkg-b': {
                decisions: {
                    version: {
                        previousVersion: undefined,
                        chosenVersion: '0.0.1',
                        trigger: 'initial'
                    }
                },
                outputs: {
                    tarball: {
                        totalBytes: 20,
                        entries: [
                            { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] },
                            { path: 'index.js', sizeBytes: 18, kind: 'source', sourcePath: '/workspace/pkg-b/index.js', status: 'unchanged', badges: [] }
                        ]
                    }
                },
                timings: {}
            }
        },
        aggregate: { crossBundleLinks: [] }
    };
}

test('buildPreviewDocument orders packages by report order and formats version transitions', async () => {
    const document = await buildPreviewDocument({
        report: baseReport(),
        result: Result.ok([buildResult(), buildResult({ bundle: versionedBundleWithManifest({ name: 'pkg-b', manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false }, packageJson: { name: 'pkg-b', version: '0.0.1' }, contents: [{ fileDescription: { sourceFilePath: '/workspace/pkg-b/index.js', targetFilePath: 'index.js', content: 'export {};\n', isExecutable: false }, directDependencies: new Set<string>(), isExplicitlyIncluded: false, isSubstituted: false, analysis: { survivingBindings: new Set<string>(), sideEffectStatements: [], sideEffectImports: new Set<string>() } }] }), status: 'initial-version' })]),
        dryRun: true,
        readWorkspaceFile: async (filePath) => {
            if (filePath === '/workspace/src/index.js') {
                return 'export const removed = 1;\n';
            }
            return 'export {};\n';
        }
    });

    assert.deepStrictEqual(
        document.packages.map((pkg) => {
            return [pkg.name, pkg.versionTransition];
        }),
        [
            ['pkg-a', '1.0.0 -> 1.0.1'],
            ['pkg-b', '0.0.1']
        ]
    );
});

test('buildPreviewDocument sorts package.json first and creates diffs only for changed source files', async () => {
    const document = await buildPreviewDocument({
        report: baseReport(),
        result: Result.ok([buildResult()]),
        dryRun: true,
        readWorkspaceFile: async (filePath) => {
            if (filePath === '/workspace/src/index.js') {
                return 'export const removed = 1;\n';
            }
            if (filePath === '/workspace/src/index.js.map') {
                return '{"version":2}';
            }
            return 'export declare const kept: number;\n';
        }
    });

    const [pkg] = document.packages;
    if (pkg === undefined) {
        assert.fail('expected preview package');
    }
    assert.strictEqual(pkg.tree[0]?.path, 'package.json');
    const diffedFiles = pkg.tree.filter((entry) => {
        return entry.type === 'file' && entry.artifact?.diff !== undefined;
    });
    assert.deepStrictEqual(
        diffedFiles.map((entry) => {
            return entry.path;
        }),
        ['src/index.js']
    );
});

test('buildPreviewDocument keeps eliminated files separate from the emitted tree', async () => {
    const document = await buildPreviewDocument({
        report: baseReport(),
        result: Result.ok([buildResult()]),
        dryRun: true,
        readWorkspaceFile: async () => 'export {};\n'
    });

    const [pkg] = document.packages;
    if (pkg === undefined) {
        assert.fail('expected preview package');
    }
    assert.deepStrictEqual(pkg.eliminatedSourceFiles, [
        { path: '/workspace/src/unused.js', reason: 'not-emitted-after-analysis', sourceBytes: 14 }
    ]);
    assert.strictEqual(
        pkg.tree.some((entry) => {
            return entry.path === '/workspace/src/unused.js';
        }),
        false
    );
});

test('buildPreviewDocument reports failure-only runs with direct issues', async () => {
    const document = await buildPreviewDocument({
        report: { ...baseReport(), packages: {} },
        result: Result.err({ type: 'checks', issues: ['bundle is too large'] }),
        dryRun: true
    });

    assert.strictEqual(document.previewable, false);
    assert.strictEqual(document.resultType, 'checks');
    assert.deepStrictEqual(document.issues, ['bundle is too large']);
});

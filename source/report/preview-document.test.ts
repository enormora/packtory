/* eslint-disable import/max-dependencies -- the preview-document tests intentionally combine filesystem, fixtures, and report helpers */
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { test } from 'mocha';
import { Result } from 'true-myth';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { ArtifactEntry } from '../progress/progress-broadcaster.ts';
import {
    createAnalyzedResource,
    createArtifactEntryFixture,
    createBuildReportFixture,
    createBuildResultFixture
} from '../test-libraries/preview-fixtures.ts';
import {
    artifactBadgeLabel,
    artifactStatusLabel,
    buildPreviewDocument,
    type PreviewDocument
} from './preview-document.ts';
import {
    buildArtifactTree,
    buildBundleArtifactIndex,
    buildVersionTransition,
    getIssues,
    getResultType,
    getSucceededResults,
    hasMeaningfulChanges,
    isPreviewableResult,
    type PreviewFileNode
} from './preview-document-helpers.ts';
import { isDiffableArtifact, toDiffLineType } from './preview-document-diff.ts';
import { compareTreeNodes, treeNodeSortKey } from './preview-document-tree.ts';
import type { BuildReport, PackageReport } from './report-aggregator.ts';

const eliminatedUnusedFile = {
    path: '/workspace/src/unused.js',
    reason: 'not-emitted-after-analysis',
    sourceBytes: 14
} as const;

function buildResult(overrides: Parameters<typeof createBuildResultFixture>[0] = {}): BuildAndPublishResult {
    return createBuildResultFixture({
        contents: [
            createAnalyzedResource({
                sourceFilePath: '/workspace/src/index.js',
                targetFilePath: 'src/index.js',
                content: 'export const kept = 1;\n'
            }),
            createAnalyzedResource({
                sourceFilePath: '/workspace/src/index.js.map',
                targetFilePath: 'src/index.js.map',
                content: '{"version":3}'
            }),
            createAnalyzedResource({
                sourceFilePath: '/workspace/types/index.d.ts',
                targetFilePath: 'types/index.d.ts',
                content: 'export declare const kept: number;\n'
            })
        ],
        ...overrides
    });
}

function createPackageReport(entries: readonly ArtifactEntry[], overrides: Partial<PackageReport> = {}): PackageReport {
    return {
        decisions: {},
        outputs: {
            tarball: {
                totalBytes: entries.reduce((total, entry) => total + entry.sizeBytes, 0),
                entries
            }
        },
        timings: {},
        ...overrides
    };
}

function reportForPkgA(entries: readonly ArtifactEntry[], overrides: Partial<PackageReport> = {}): BuildReport {
    return createBuildReportFixture({
        packages: {
            'pkg-a': createPackageReport(entries, overrides)
        }
    });
}

function tinyUnchangedSource(pathname: string): ArtifactEntry {
    return createArtifactEntryFixture({
        path: pathname,
        sizeBytes: 1,
        sourcePath: `/workspace/${pathname}`,
        status: 'unchanged',
        badges: []
    });
}

function baseReport(): BuildReport {
    return createBuildReportFixture({
        packages: {
            'pkg-a': createPackageReport(
                [
                    createArtifactEntryFixture({
                        path: 'src/index.js',
                        sizeBytes: 22,
                        sourcePath: '/workspace/src/index.js',
                        badges: ['dead-code-elimination']
                    }),
                    createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                    createArtifactEntryFixture({
                        path: 'src/index.js.map',
                        sizeBytes: 13,
                        sourcePath: '/workspace/src/index.js.map',
                        badges: ['dead-code-elimination']
                    }),
                    createArtifactEntryFixture({
                        path: 'types/index.d.ts',
                        sizeBytes: 35,
                        sourcePath: '/workspace/types/index.d.ts',
                        status: 'unchanged',
                        badges: []
                    })
                ],
                {
                    decisions: {
                        version: {
                            previousVersion: '1.0.0',
                            chosenVersion: '1.0.1',
                            trigger: 'auto-patch-bump'
                        }
                    },
                    eliminatedSourceFiles: [eliminatedUnusedFile]
                }
            ),
            'pkg-b': createPackageReport(
                [
                    createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                    createArtifactEntryFixture({
                        path: 'index.js',
                        sizeBytes: 18,
                        sourcePath: '/workspace/pkg-b/index.js',
                        status: 'unchanged',
                        badges: []
                    })
                ],
                {
                    decisions: {
                        version: {
                            previousVersion: undefined,
                            chosenVersion: '0.0.1',
                            trigger: 'initial'
                        }
                    }
                }
            )
        }
    });
}

function workspaceReader(contentByPath: Readonly<Record<string, string>>, fallback = 'export {};\n') {
    return async (filePath: string): Promise<string> => {
        return contentByPath[filePath] ?? fallback;
    };
}

function requireSinglePackage(document: PreviewDocument) {
    const [pkg] = document.packages;
    if (pkg === undefined) {
        assert.fail('expected preview package');
    }
    return pkg;
}

function requirePackageAt(document: PreviewDocument, index: number) {
    const pkg = document.packages[index];
    if (pkg === undefined) {
        assert.fail(`expected preview package at index ${String(index)}`);
    }
    return pkg;
}

function requireTreeNodeAt(document: PreviewDocument, packageIndex: number, treeIndex: number) {
    const node = requirePackageAt(document, packageIndex).tree[treeIndex];
    if (node === undefined) {
        assert.fail(`expected tree node at index ${String(treeIndex)}`);
    }
    return node;
}

function requireFileNodeAt(document: PreviewDocument, packageIndex: number, treeIndex: number): PreviewFileNode {
    const node = requireTreeNodeAt(document, packageIndex, treeIndex);
    if (node.type !== 'file' || node.artifact === undefined) {
        assert.fail('expected file node');
    }
    return node;
}

function requireFileNodeByPath(document: PreviewDocument, packageIndex: number, filePath: string): PreviewFileNode {
    const node = requirePackageAt(document, packageIndex).tree.find((entry) => entry.path === filePath);
    if (node?.type !== 'file' || node.artifact === undefined) {
        assert.fail(`expected file node for path ${filePath}`);
    }
    return node;
}

async function buildSingleArtifactDocument(
    options: {
        readonly artifactSourcePath?: string;
        readonly reportSourcePath?: string;
        readonly emittedContent?: string;
        readonly workspaceContent?: string;
        readonly result?: ReturnType<typeof Result.ok<readonly BuildAndPublishResult[]>>;
        readonly report?: BuildReport;
        readonly dryRun?: boolean;
    } = {}
): Promise<PreviewDocument> {
    const artifactSourcePath = options.artifactSourcePath ?? '/workspace/index.js';
    return buildPreviewDocument({
        report:
            options.report ??
            reportForPkgA([
                createArtifactEntryFixture({
                    path: 'index.js',
                    sizeBytes: 10,
                    sourcePath: options.reportSourcePath ?? artifactSourcePath,
                    badges: []
                })
            ]),
        result:
            options.result ??
            Result.ok([
                createBuildResultFixture({
                    contents: [
                        createAnalyzedResource({
                            sourceFilePath: artifactSourcePath,
                            targetFilePath: 'index.js',
                            content: options.emittedContent ?? 'export const same = 1;\n'
                        })
                    ]
                })
            ]),
        dryRun: options.dryRun ?? true,
        readWorkspaceFile: async () => options.workspaceContent ?? 'export const same = 1;\n'
    });
}

async function buildUnchangedPackageDocument(overrides: Partial<PackageReport> = {}): Promise<PreviewDocument> {
    return buildPreviewDocument({
        report: createBuildReportFixture({
            packages: {
                'pkg-a': createPackageReport([tinyUnchangedSource('src/index.js')], overrides)
            }
        }),
        result: Result.ok([buildResult({ contents: [createAnalyzedResource({ content: 'export {};\n' })] })]),
        dryRun: true,
        readWorkspaceFile: async () => 'export {};\n'
    });
}

async function buildChangedSourceDiffDocument(
    emittedContent: string,
    workspaceContent: string
): Promise<PreviewDocument> {
    return buildPreviewDocument({
        report: reportForPkgA([
            createArtifactEntryFixture({
                path: 'src/index.js',
                sourcePath: '/workspace/src/index.js',
                status: 'changed',
                badges: []
            })
        ]),
        result: Result.ok([
            createBuildResultFixture({
                contents: [
                    createAnalyzedResource({
                        sourceFilePath: '/workspace/src/index.js',
                        targetFilePath: 'src/index.js',
                        content: emittedContent
                    })
                ]
            })
        ]),
        dryRun: true,
        readWorkspaceFile: async () => workspaceContent
    });
}

async function expectTreePaths(entries: readonly ArtifactEntry[], expectedPaths: readonly string[]): Promise<void> {
    const document = await buildPreviewDocument({
        report: reportForPkgA(entries),
        result: Result.ok([buildResult()]),
        dryRun: true,
        readWorkspaceFile: async () => 'export {};\n'
    });

    assert.deepStrictEqual(
        requirePackageAt(document, 0).tree.map((entry) => entry.path),
        expectedPaths
    );
}

function assertFirstFileHasNoDiff(document: PreviewDocument): void {
    assert.strictEqual(requireFileNodeAt(document, 0, 0).artifact.diff, undefined);
}

test('buildPreviewDocument orders packages by report order and formats version transitions', async () => {
    const document = await buildPreviewDocument({
        report: baseReport(),
        result: Result.ok([
            buildResult(),
            createBuildResultFixture({
                packageName: 'pkg-b',
                version: '0.0.1',
                status: 'initial-version',
                contents: [
                    createAnalyzedResource({
                        sourceFilePath: '/workspace/pkg-b/index.js',
                        targetFilePath: 'index.js',
                        content: 'export {};\n'
                    })
                ]
            })
        ]),
        dryRun: true,
        readWorkspaceFile: workspaceReader({ '/workspace/src/index.js': 'export const removed = 1;\n' })
    });

    assert.deepStrictEqual(
        document.packages.map((pkg) => [pkg.name, pkg.versionTransition]),
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
        readWorkspaceFile: workspaceReader({
            '/workspace/src/index.js': 'export const removed = 1;\n',
            '/workspace/src/index.js.map': '{"version":2}',
            '/workspace/types/index.d.ts': 'export declare const kept: number;\n'
        })
    });

    const pkg = requireSinglePackage(document);
    assert.strictEqual(requireTreeNodeAt(document, 0, 0).path, 'package.json');
    assert.deepStrictEqual(
        pkg.tree
            .filter((entry) => entry.type === 'file' && entry.artifact?.diff !== undefined)
            .map((entry) => entry.path),
        ['src/index.js']
    );
});

test('buildPreviewDocument builds exact tree ordering, depths, and summary counts', async () => {
    const report = createBuildReportFixture({
        packages: {
            'pkg-a': createPackageReport(
                [
                    createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                    createArtifactEntryFixture({
                        path: 'dist/index.js',
                        sizeBytes: 10,
                        sourcePath: '/workspace/src/index.js',
                        status: 'changed',
                        badges: []
                    }),
                    createArtifactEntryFixture({
                        path: 'types/internal/index.d.ts',
                        sizeBytes: 5,
                        sourcePath: '/workspace/types/internal/index.d.ts',
                        status: 'unchanged',
                        badges: []
                    })
                ],
                {
                    eliminatedSourceFiles: [
                        { path: '/workspace/src/unused.js', reason: 'not-emitted-after-analysis', sourceBytes: 14 }
                    ]
                }
            ),
            'pkg-b': createPackageReport([
                createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                createArtifactEntryFixture({
                    path: 'index.js',
                    sizeBytes: 3,
                    sourcePath: '/workspace/pkg-b/index.js',
                    status: 'unchanged',
                    badges: []
                })
            ])
        }
    });
    const result = Result.ok([
        createBuildResultFixture({
            contents: [
                createAnalyzedResource({
                    sourceFilePath: '/workspace/src/index.js',
                    targetFilePath: 'dist/index.js',
                    content: 'export const changed = 1;\n'
                }),
                createAnalyzedResource({
                    sourceFilePath: '/workspace/types/internal/index.d.ts',
                    targetFilePath: 'types/internal/index.d.ts',
                    content: 'export declare const kept: number;\n'
                })
            ]
        }),
        createBuildResultFixture({
            packageName: 'pkg-b',
            contents: [
                createAnalyzedResource({
                    sourceFilePath: '/workspace/pkg-b/index.js',
                    targetFilePath: 'index.js',
                    content: 'ok\n'
                })
            ]
        })
    ]);
    const document = await buildPreviewDocument({
        report,
        result,
        dryRun: true,
        readWorkspaceFile: workspaceReader({
            '/workspace/src/index.js': 'export const original = 1;\n',
            '/workspace/types/internal/index.d.ts': 'export declare const kept: number;\n',
            '/workspace/pkg-b/index.js': 'ok\n'
        })
    });

    assert.deepStrictEqual(document.summary, {
        totalPackages: 2,
        changedPackages: 1,
        unchangedPackages: 1,
        failedPackages: 0,
        emittedArtifacts: 5,
        changedArtifacts: 1,
        eliminatedSourceFiles: 1
    });
    assert.deepStrictEqual(
        requirePackageAt(document, 0).tree.map((entry) => [entry.path, entry.depth, entry.type]),
        [
            ['package.json', 0, 'file'],
            ['dist', 1, 'directory'],
            ['dist/index.js', 1, 'file'],
            ['types', 1, 'directory'],
            ['types/internal', 2, 'directory'],
            ['types/internal/index.d.ts', 2, 'file']
        ]
    );
    assert.deepStrictEqual(
        requirePackageAt(document, 1).tree.map((entry) => [entry.path, entry.depth, entry.type]),
        [
            ['package.json', 0, 'file'],
            ['index.js', 0, 'file']
        ]
    );
});

test('buildPreviewDocument keeps eliminated files separate from the emitted tree', async () => {
    const document = await buildPreviewDocument({
        report: baseReport(),
        result: Result.ok([buildResult()]),
        dryRun: true,
        readWorkspaceFile: async () => 'export {};\n'
    });

    const pkg = requireSinglePackage(document);
    assert.deepStrictEqual(pkg.eliminatedSourceFiles, [eliminatedUnusedFile]);
    assert.strictEqual(
        pkg.tree.some((entry) => entry.path === eliminatedUnusedFile.path),
        false
    );
});

test('buildPreviewDocument treats eliminated-only packages as changed and opens them by default', async () => {
    const document = await buildUnchangedPackageDocument({ eliminatedSourceFiles: [eliminatedUnusedFile] });

    assert.strictEqual(requirePackageAt(document, 0).hasChanges, true);
    assert.strictEqual(requirePackageAt(document, 0).openByDefault, true);
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

test('buildPreviewDocument marks a partial run with succeeded packages as previewable', async () => {
    const document = await buildPreviewDocument({
        report: baseReport(),
        result: Result.err({ type: 'partial', succeeded: [buildResult()], failures: [new Error('boom')] }),
        dryRun: true,
        readWorkspaceFile: async () => 'export {};\n'
    });

    assert.strictEqual(document.previewable, true);
    assert.strictEqual(document.resultType, 'partial');
    assert.deepStrictEqual(document.issues, ['boom']);
});

test('buildPreviewDocument keeps unchanged packages closed unless they failed', async () => {
    const unchangedDocument = await buildUnchangedPackageDocument({ eliminatedSourceFiles: [] });
    const failedDocument = await buildUnchangedPackageDocument({
        eliminatedSourceFiles: [],
        failure: { stage: 'publish', message: 'boom' }
    });

    assert.strictEqual(requirePackageAt(unchangedDocument, 0).hasChanges, false);
    assert.strictEqual(requirePackageAt(unchangedDocument, 0).openByDefault, false);
    assert.strictEqual(requirePackageAt(failedDocument, 0).openByDefault, true);
    assert.strictEqual(failedDocument.summary.failedPackages, 1);
});

test('buildPreviewDocument leaves versionTransition undefined when no version decision exists', async () => {
    const document = await buildPreviewDocument({
        report: createBuildReportFixture({
            packages: {
                'pkg-a': createPackageReport(
                    [createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] })]
                )
            }
        }),
        result: Result.ok([buildResult()]),
        dryRun: true,
        readWorkspaceFile: async () => 'export {};\n'
    });

    assert.strictEqual(requirePackageAt(document, 0).versionTransition, undefined);
});

test('buildPreviewDocument uses publish mode when dryRun is false', async () => {
    const document = await buildSingleArtifactDocument({ dryRun: false });

    assert.strictEqual(document.modeLabel, 'Publish');
});

test('buildPreviewDocument omits diffs when the artifact source path does not match the emitted content source', async () => {
    const document = await buildSingleArtifactDocument({
        artifactSourcePath: '/workspace/actual.js',
        reportSourcePath: '/workspace/other.js',
        emittedContent: 'export const changed = 1;\n',
        workspaceContent: 'export const original = 1;\n'
    });

    assertFirstFileHasNoDiff(document);
});

test('buildPreviewDocument uses the default workspace file reader when none is provided', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'packtory-preview-test-'));
    const sourceFilePath = path.join(tempDir, 'index.js');
    await writeFile(sourceFilePath, 'export const original = 1;\n');

    const document = await buildPreviewDocument({
        report: reportForPkgA([
            createArtifactEntryFixture({
                path: 'index.js',
                sizeBytes: 10,
                sourcePath: sourceFilePath,
                badges: []
            })
        ]),
        result: Result.ok([
            createBuildResultFixture({
                contents: [
                    createAnalyzedResource({
                        sourceFilePath,
                        targetFilePath: 'index.js',
                        content: 'export const changed = 1;\n'
                    })
                ]
            })
        ]),
        dryRun: true
    });

    const fileNode = requirePackageAt(document, 0).tree.find(
        (entry) => entry.type === 'file' && entry.path === 'index.js'
    );
    if (fileNode?.type !== 'file') {
        assert.fail('expected index.js file node');
    }
    assert.ok(fileNode.artifact.diff !== undefined);
});

test('buildPreviewDocument orders directories before files and sorts alphabetically after package.json', async () => {
    await expectTreePaths(
        [
            tinyUnchangedSource('z-last.js'),
            createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
            tinyUnchangedSource('a/inside.js')
        ],
        ['package.json', 'a', 'a/inside.js', 'z-last.js']
    );
});

test('artifact label helpers return the expected labels for unchanged and rewrite values', () => {
    assert.strictEqual(artifactStatusLabel('unchanged'), 'unchanged');
    assert.strictEqual(artifactBadgeLabel('import-path-rewrite'), 'rewrite');
});

test('preview helper functions classify result shapes exactly', () => {
    const succeeded = [buildResult()];
    const success = Result.ok(succeeded);
    const partialError = { type: 'partial' as const, succeeded: [buildResult()], failures: [new Error('boom')] };
    const partial = Result.err(partialError);
    const partialOnlyFailures = Result.err({
        type: 'partial' as const,
        succeeded: [],
        failures: [new Error('boom')]
    });
    const checks = Result.err({ type: 'checks' as const, issues: ['bad'] });
    const config = Result.err({ type: 'config' as const, issues: ['broken'] });

    assert.strictEqual(isPreviewableResult(success), true);
    assert.strictEqual(isPreviewableResult(partial), true);
    assert.strictEqual(isPreviewableResult(partialOnlyFailures), false);
    assert.deepStrictEqual(getSucceededResults(success), succeeded);
    assert.deepStrictEqual(getSucceededResults(partial), partialError.succeeded);
    assert.deepStrictEqual(getSucceededResults(checks), []);
    assert.deepStrictEqual(getIssues(checks), ['bad']);
    assert.deepStrictEqual(getIssues(config), ['broken']);
    assert.deepStrictEqual(getIssues(partial), ['boom']);
    assert.deepStrictEqual(getIssues(success), []);
    assert.strictEqual(getResultType(success), 'success');
    assert.strictEqual(getResultType(checks), 'checks');
    assert.strictEqual(getResultType(config), 'config');
});

test('preview helper functions classify artifacts, diff lines, and package changes exactly', () => {
    assert.strictEqual(
        isDiffableArtifact(
            createArtifactEntryFixture({
                path: 'src/index.js',
                sourcePath: '/workspace/src/index.js',
                status: 'changed',
                kind: 'source',
                badges: []
            })
        ),
        true
    );
    assert.strictEqual(
        isDiffableArtifact(
            createArtifactEntryFixture({
                path: 'src/index.js.map',
                sourcePath: '/workspace/src/index.js.map',
                status: 'changed',
                kind: 'source',
                badges: []
            })
        ),
        false
    );
    assert.strictEqual(
        isDiffableArtifact({
            path: 'index.js',
            sizeBytes: 2,
            kind: 'manifest',
            sourcePath: '/workspace/index.js',
            status: 'changed',
            badges: []
        }),
        false
    );
    assert.strictEqual(
        isDiffableArtifact({
            path: 'src/index.js',
            sizeBytes: 20,
            kind: 'source',
            status: 'changed',
            badges: []
        }),
        false
    );
    assert.strictEqual(
        isDiffableArtifact(
            createArtifactEntryFixture({
                path: 'src/index.js',
                sourcePath: '/workspace/src/index.js',
                status: 'unchanged',
                badges: []
            })
        ),
        false
    );
    assert.strictEqual(
        isDiffableArtifact(
            createArtifactEntryFixture({
                path: 'package.json',
                kind: 'manifest',
                status: 'generated',
                badges: []
            })
        ),
        false
    );
    assert.strictEqual(toDiffLineType('+added'), 'add');
    assert.strictEqual(toDiffLineType('-removed'), 'remove');
    assert.strictEqual(toDiffLineType(' unchanged'), 'context');
    assert.strictEqual(hasMeaningfulChanges([tinyUnchangedSource('src/index.js')], []), false);
    assert.strictEqual(
        hasMeaningfulChanges([createArtifactEntryFixture({ path: 'src/index.js', status: 'changed', badges: [] })], []),
        true
    );
});

test('preview helper functions build manifest-aware artifact indices and version labels', () => {
    const resultA = createBuildResultFixture({
        packageName: 'pkg-a',
        contents: [createAnalyzedResource({ targetFilePath: 'dist/index.js', content: 'export {};\n' })]
    });
    const index = buildBundleArtifactIndex([resultA]);
    const packageIndex = index.get('pkg-a');
    if (packageIndex === undefined) {
        assert.fail('expected pkg-a index');
    }
    assert.deepStrictEqual(packageIndex.get('package.json'), { content: '{}' });
    assert.deepStrictEqual(packageIndex.get('dist/index.js'), {
        content: 'export {};\n',
        sourcePath: '/workspace/src/index.js'
    });
    assert.strictEqual(
        buildVersionTransition(
            createPackageReport([], {
                decisions: {
                    version: { previousVersion: '1.0.0', chosenVersion: '1.1.0', trigger: 'minimum' }
                }
            })
        ),
        '1.0.0 -> 1.1.0'
    );
    assert.strictEqual(buildVersionTransition(createPackageReport([], { decisions: {} })), undefined);
});

test('preview helper functions sort and flatten tree nodes with package.json first', () => {
    const tree = buildArtifactTree([
        createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
        createArtifactEntryFixture({ path: 'src/index.js', badges: [] }),
        createArtifactEntryFixture({ path: 'alpha.js', badges: [] }),
        createArtifactEntryFixture({ path: 'src/internal.js', badges: [] })
    ]);

    assert.deepStrictEqual(
        tree.map((entry) => [entry.path, entry.depth, entry.type]),
        [
            ['package.json', 0, 'file'],
            ['src', 1, 'directory'],
            ['src/index.js', 1, 'file'],
            ['src/internal.js', 1, 'file'],
            ['alpha.js', 0, 'file']
        ]
    );
    assert.ok(
        compareTreeNodes({ name: 'package.json', type: 'file' }, { name: 'src', type: 'directory' }) < 0
    );
    assert.ok(
        compareTreeNodes({ name: 'package.json', type: 'directory' }, { name: 'package.json', type: 'file' }) > 0
    );
    assert.strictEqual(treeNodeSortKey({ name: 'package.json', type: 'file' }), '0:package.json');
});

test('buildArtifactTree uses a path-based tiebreak when sort keys match', () => {
    const tree = buildArtifactTree([
        createArtifactEntryFixture({ path: 'b/index.js', badges: [] }),
        createArtifactEntryFixture({ path: 'a/index.js', badges: [] })
    ]);

    assert.deepStrictEqual(
        tree.map((entry) => entry.path),
        ['a', 'a/index.js', 'b', 'b/index.js']
    );
});

test('buildPreviewDocument limits diffs to two hunks and drops patch metadata lines', async () => {
    const document = await buildChangedSourceDiffDocument(
        'a();\nkeep1();\nkeep2();\nkeep3();\nkeep4();\nkeep5();\nkeep6();\nkeep7();\nkeep8();\nb();\nkeep9();\nkeep10();\nkeep11();\nkeep12();\nkeep13();\nkeep14();\nkeep15();\nkeep16();\nc();\n',
        'oldA();\nkeep1();\nkeep2();\nkeep3();\nkeep4();\nkeep5();\nkeep6();\nkeep7();\nkeep8();\noldB();\nkeep9();\nkeep10();\nkeep11();\nkeep12();\nkeep13();\nkeep14();\nkeep15();\nkeep16();\noldC();\n'
    );

    const { diff } = requireFileNodeByPath(document, 0, 'src/index.js').artifact;
    if (diff === undefined) {
        assert.fail('expected diff');
    }
    assert.deepStrictEqual(
        diff.map((hunk) => [hunk.header, hunk.lines.some((line) => line.text.startsWith('\\'))]),
        [
            ['@@ -1,4 +1,4 @@', false],
            ['@@ -7,7 +7,7 @@', false]
        ]
    );
});

test('buildPreviewDocument drops no-newline markers from diff lines', async () => {
    const document = await buildChangedSourceDiffDocument('changed', 'original');

    const { diff } = requireFileNodeByPath(document, 0, 'src/index.js').artifact;
    if (diff === undefined) {
        assert.fail('expected diff');
    }
    assert.ok(
        diff.every((hunk) => {
            return hunk.lines.every((line) => {
                return !line.text.startsWith('\\');
            });
        })
    );
});

test('buildPreviewDocument does not attach a diff property when no diff exists', async () => {
    const document = await buildSingleArtifactDocument();
    const fileNode = requireFileNodeAt(document, 0, 0);

    assert.strictEqual('diff' in fileNode.artifact, false);
});

test('buildPreviewDocument skips diffs when the emitted artifact content matches the workspace file', async () => {
    assertFirstFileHasNoDiff(await buildSingleArtifactDocument());
});

test('buildPreviewDocument skips diffs when the report source path does not match the emitted artifact source path', async () => {
    assertFirstFileHasNoDiff(
        await buildSingleArtifactDocument({
            reportSourcePath: '/workspace/report-index.js',
            workspaceContent: 'export const same = 1;\n'
        })
    );
});

test('buildPreviewDocument labels unchanged context lines in generated diffs', async () => {
    const document = await buildSingleArtifactDocument({
        emittedContent: 'keep();\nnewLine();\n',
        workspaceContent: 'keep();\noldLine();\n'
    });
    const { artifact } = requireFileNodeAt(document, 0, 0);
    const { diff } = artifact;
    if (diff === undefined) {
        assert.fail('expected diff');
    }
    assert.strictEqual(
        diff.some((hunk) => hunk.lines.some((line) => line.type === 'context')),
        true
    );
});

test('buildPreviewDocument handles failed packages without outputs and publish-mode labels', async () => {
    const document = await buildPreviewDocument({
        report: createBuildReportFixture({
            packages: {
                'pkg-a': {
                    decisions: {},
                    failure: { stage: 'publish', message: 'boom' },
                    timings: {}
                }
            }
        }),
        result: Result.err({ type: 'partial', succeeded: [], failures: [new Error('boom')] }),
        dryRun: false,
        readWorkspaceFile: async () => 'export {};\n'
    });

    assert.strictEqual(document.modeLabel, 'Publish');
    const pkg = requireSinglePackage(document);
    if (pkg.failure === undefined) {
        assert.fail('expected package failure');
    }
    assert.strictEqual(pkg.failure.message, 'boom');
    assert.strictEqual(pkg.openByDefault, true);
    assert.deepStrictEqual(pkg.tree, []);
    assert.deepStrictEqual(document.summary, {
        totalPackages: 1,
        changedPackages: 0,
        unchangedPackages: 0,
        failedPackages: 1,
        emittedArtifacts: 0,
        changedArtifacts: 0,
        eliminatedSourceFiles: 0
    });
});

test('buildPreviewDocument reuses existing directories and supports nested directory sorting', async () => {
    await expectTreePaths(
        [
            tinyUnchangedSource('top.js'),
            tinyUnchangedSource('nested/deeper/a.js'),
            tinyUnchangedSource('nested/deeper/b.js')
        ],
        ['nested', 'nested/deeper', 'nested/deeper/a.js', 'nested/deeper/b.js', 'top.js']
    );
});

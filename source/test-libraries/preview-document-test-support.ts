import assert from 'node:assert';
import { Result } from 'true-myth';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { ArtifactEntry } from '../progress/progress-broadcaster.ts';
import type { BuildReport, PackageReport } from '../report/aggregator/report-types.ts';
import {
    buildPreviewDocument,
    type PreviewDocument,
    type PreviewPackage
} from '../report/preview/preview-document.ts';
import type { PreviewArtifactNode } from '../report/preview/artifact-tree-builder.ts';
import {
    createAnalyzedResource,
    createArtifactEntryFixture,
    createBuildReportFixture,
    createBuildResultFixture
} from './preview-fixtures.ts';

export const eliminatedUnusedFile = {
    path: '/workspace/src/unused.js',
    reason: 'not-emitted-after-analysis',
    sourceBytes: 14
} as const;

type PreviewFileNode = Extract<PreviewArtifactNode, { readonly type: 'file'; }>;
type PreviewBuildResult = ReturnType<typeof Result.ok<readonly BuildAndPublishResult[]>>;
type SingleArtifactDocumentOptions = {
    readonly artifactSourcePath?: string;
    readonly reportSourcePath?: string;
    readonly emittedContent?: string;
    readonly workspaceContent?: string;
    readonly result?: PreviewBuildResult;
    readonly report?: BuildReport;
    readonly dryRun?: boolean;
};

export function buildResult(overrides: Parameters<typeof createBuildResultFixture>[0] = {}): BuildAndPublishResult {
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

export function createPackageReport(
    entries: readonly ArtifactEntry[],
    overrides: Partial<PackageReport> = {}
): PackageReport {
    return {
        decisions: {},
        outputs: {
            tarball: {
                totalBytes: entries.reduce(function (total, entry) {
                    return total + entry.sizeBytes;
                }, 0),
                entries
            }
        },
        timings: {},
        ...overrides
    };
}

export function reportForPkgA(entries: readonly ArtifactEntry[], overrides: Partial<PackageReport> = {}): BuildReport {
    return createBuildReportFixture({
        packages: {
            'pkg-a': createPackageReport(entries, overrides)
        }
    });
}

export function tinyUnchangedSource(pathname: string): ArtifactEntry {
    return createArtifactEntryFixture({
        path: pathname,
        sizeBytes: 1,
        sourcePath: `/workspace/${pathname}`,
        status: 'unchanged',
        badges: []
    });
}

export function baseReport(): BuildReport {
    return createBuildReportFixture({
        packages: {
            'pkg-a': createPackageReport(
                [
                    createArtifactEntryFixture({
                        path: 'src/index.js',
                        sizeBytes: 22,
                        sourcePath: '/workspace/src/index.js',
                        badges: [ 'dead-code-elimination' ]
                    }),
                    createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                    createArtifactEntryFixture({
                        path: 'src/index.js.map',
                        sizeBytes: 13,
                        sourcePath: '/workspace/src/index.js.map',
                        badges: [ 'dead-code-elimination' ]
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
                    eliminatedSourceFiles: [ eliminatedUnusedFile ]
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

export function workspaceReader(
    contentByPath: Readonly<Record<string, string>>,
    fallback = 'export {};\n'
): (filePath: string) => Promise<string> {
    return async function (filePath: string): Promise<string> {
        return contentByPath[filePath] ?? fallback;
    };
}

export function workspaceFileManager(readFile: (filePath: string) => Promise<string>): Pick<FileManager, 'readFile'> {
    return { readFile };
}

export function requireSinglePackage(document: PreviewDocument): PreviewPackage {
    const [ pkg ] = document.packages;
    if (pkg === undefined) {
        assert.fail('expected preview package');
    }
    return pkg;
}

export function requirePackageAt(document: PreviewDocument, index: number): PreviewPackage {
    const pkg = document.packages[index];
    if (pkg === undefined) {
        assert.fail(`expected preview package at index ${String(index)}`);
    }
    return pkg;
}

export function requireTreeNodeAt(
    document: PreviewDocument,
    packageIndex: number,
    treeIndex: number
): PreviewArtifactNode {
    const node = requirePackageAt(document, packageIndex).tree[treeIndex];
    if (node === undefined) {
        assert.fail(`expected tree node at index ${String(treeIndex)}`);
    }
    return node;
}

export function requireFileNodeAt(document: PreviewDocument, packageIndex: number, treeIndex: number): PreviewFileNode {
    const node = requireTreeNodeAt(document, packageIndex, treeIndex);
    if (node.type !== 'file') {
        assert.fail('expected file node');
    }
    return node;
}

export function requireFileNodeByPath(
    document: PreviewDocument,
    packageIndex: number,
    filePath: string
): PreviewFileNode {
    const node = requirePackageAt(document, packageIndex).tree.find(function (entry) {
        return entry.path === filePath;
    });
    if (node?.type !== 'file') {
        assert.fail(`expected file node for path ${filePath}`);
    }
    return node;
}

function singleArtifactReport(options: SingleArtifactDocumentOptions, artifactSourcePath: string): BuildReport {
    return options.report ??
        reportForPkgA([
            createArtifactEntryFixture({
                path: 'index.js',
                sizeBytes: 10,
                sourcePath: options.reportSourcePath ?? artifactSourcePath,
                badges: []
            })
        ]);
}

function singleArtifactResult(options: SingleArtifactDocumentOptions, artifactSourcePath: string): PreviewBuildResult {
    return options.result ??
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
        ]);
}

export async function buildSingleArtifactDocument(
    options: SingleArtifactDocumentOptions = {}
): Promise<PreviewDocument> {
    const artifactSourcePath = options.artifactSourcePath ?? '/workspace/index.js';
    return buildPreviewDocument({
        report: singleArtifactReport(options, artifactSourcePath),
        result: singleArtifactResult(options, artifactSourcePath),
        dryRun: options.dryRun ?? true,
        fileManager: workspaceFileManager(async function () {
            return options.workspaceContent ?? 'export const same = 1;\n';
        })
    });
}

export async function buildUnchangedPackageDocument(overrides: Partial<PackageReport> = {}): Promise<PreviewDocument> {
    return buildPreviewDocument({
        report: createBuildReportFixture({
            packages: {
                'pkg-a': createPackageReport([ tinyUnchangedSource('src/index.js') ], overrides)
            }
        }),
        result: Result.ok([ buildResult({ contents: [ createAnalyzedResource({ content: 'export {};\n' }) ] }) ]),
        dryRun: true,
        fileManager: workspaceFileManager(async function () {
            return 'export {};\n';
        })
    });
}

export async function buildChangedSourceDiffDocument(
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
        fileManager: workspaceFileManager(async function () {
            return workspaceContent;
        })
    });
}

export async function expectTreePaths(
    entries: readonly ArtifactEntry[],
    expectedPaths: readonly string[]
): Promise<void> {
    const document = await buildPreviewDocument({
        report: reportForPkgA(entries),
        result: Result.ok([ buildResult() ]),
        dryRun: true,
        fileManager: workspaceFileManager(async function () {
            return 'export {};\n';
        })
    });

    assert.deepStrictEqual(
        requirePackageAt(document, 0).tree.map(function (entry) {
            return entry.path;
        }),
        expectedPaths
    );
}

export function assertFirstFileHasNoDiff(document: PreviewDocument): void {
    assert.strictEqual(requireFileNodeAt(document, 0, 0).artifact.diff, undefined);
}

import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import {
    createAnalyzedResource,
    createArtifactEntryFixture,
    createBuildReportFixture,
    createBuildResultFixture
} from '../../test-libraries/preview-fixtures.ts';
import {
    baseReport,
    buildResult,
    createPackageReport,
    requirePackageAt,
    requireSinglePackage,
    requireTreeNodeAt,
    workspaceFileManager,
    workspaceReader
} from '../../test-libraries/preview-document-test-support.ts';
import { buildPreviewDocument } from './preview-document.ts';

suite('preview-document', function () {
    test('buildPreviewDocument orders packages by report order and formats version transitions', async function () {
        const document = await buildPreviewDocument({
            report: baseReport(),
            result: Result.ok([
                buildResult(),
                createBuildResultFixture({
                    packageName: 'package-b',
                    version: '0.0.1',
                    status: 'initial-version',
                    contents: [
                        createAnalyzedResource({
                            inputFilePath: '/workspace/package-b/index.js',
                            targetFilePath: 'index.js',
                            content: 'export {};\n'
                        })
                    ]
                })
            ]),
            dryRun: true,
            fileManager: workspaceFileManager(
                workspaceReader({ '/workspace/source/index.js': 'export const removed = 1;\n' })
            )
        });

        assert.deepStrictEqual(
            document.packages.map(function (previewPackage) {
                return [ previewPackage.name, previewPackage.versionTransition ];
            }),
            [
                [ 'package-a', '1.0.0 -> 1.0.1' ],
                [ 'package-b', '0.0.1' ]
            ]
        );
    });

    test('buildPreviewDocument sorts package.json first and creates diffs only for changed source files', async function () {
        const document = await buildPreviewDocument({
            report: baseReport(),
            result: Result.ok([ buildResult() ]),
            dryRun: true,
            fileManager: workspaceFileManager(
                workspaceReader({
                    '/workspace/source/index.js': 'export const removed = 1;\n',
                    '/workspace/source/index.js.map': '{"version":2}',
                    '/workspace/types/index.d.ts': 'export declare const kept: number;\n'
                })
            )
        });

        const previewPackage = requireSinglePackage(document);
        assert.strictEqual(requireTreeNodeAt(document, 0, 0).path, 'package.json');
        assert.deepStrictEqual(
            previewPackage
                .tree
                .filter(function (entry) {
                    return entry.type === 'file' && entry.artifact.diff !== undefined;
                })
                .map(function (entry) {
                    return entry.path;
                }),
            [ 'source/index.js' ]
        );
    });

    test('buildPreviewDocument builds exact tree ordering, depths, and summary counts', async function () {
        const report = createBuildReportFixture({
            packages: {
                'package-a': createPackageReport(
                    [
                        createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                        createArtifactEntryFixture({
                            path: 'dist/index.js',
                            sizeBytes: 10,
                            sourcePath: '/workspace/source/index.js',
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
                            {
                                path: '/workspace/source/unused.js',
                                reason: 'not-emitted-after-analysis',
                                sourceBytes: 14
                            }
                        ]
                    }
                ),
                'package-b': createPackageReport([
                    createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                    createArtifactEntryFixture({
                        path: 'index.js',
                        sizeBytes: 3,
                        sourcePath: '/workspace/package-b/index.js',
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
                        inputFilePath: '/workspace/source/index.js',
                        targetFilePath: 'dist/index.js',
                        content: 'export const changed = 1;\n'
                    }),
                    createAnalyzedResource({
                        inputFilePath: '/workspace/types/internal/index.d.ts',
                        targetFilePath: 'types/internal/index.d.ts',
                        content: 'export declare const kept: number;\n'
                    })
                ]
            }),
            createBuildResultFixture({
                packageName: 'package-b',
                contents: [
                    createAnalyzedResource({
                        inputFilePath: '/workspace/package-b/index.js',
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
            fileManager: workspaceFileManager(
                workspaceReader({
                    '/workspace/source/index.js': 'export const original = 1;\n',
                    '/workspace/types/internal/index.d.ts': 'export declare const kept: number;\n',
                    '/workspace/package-b/index.js': 'ok\n'
                })
            )
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
            requirePackageAt(document, 0).tree.map(function (entry) {
                return [ entry.path, entry.depth, entry.type ];
            }),
            [
                [ 'package.json', 0, 'file' ],
                [ 'dist', 1, 'directory' ],
                [ 'dist/index.js', 1, 'file' ],
                [ 'types', 1, 'directory' ],
                [ 'types/internal', 2, 'directory' ],
                [ 'types/internal/index.d.ts', 2, 'file' ]
            ]
        );
        assert.deepStrictEqual(requirePackageAt(document, 0).artifactCounts, { emitted: 3, changed: 1 });
        assert.deepStrictEqual(
            requirePackageAt(document, 0).changedArtifacts.map(function (artifact) {
                return artifact.path;
            }),
            [ 'dist/index.js' ]
        );
        assert.deepStrictEqual(
            requirePackageAt(document, 1).tree.map(function (entry) {
                return [ entry.path, entry.depth, entry.type ];
            }),
            [
                [ 'package.json', 0, 'file' ],
                [ 'index.js', 0, 'file' ]
            ]
        );
        assert.deepStrictEqual(requirePackageAt(document, 1).artifactCounts, { emitted: 2, changed: 0 });
        assert.deepStrictEqual(requirePackageAt(document, 1).changedArtifacts, []);
    });
});

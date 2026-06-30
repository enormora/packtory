import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import {
    createAnalyzedResource,
    createArtifactEntryFixture,
    createBuildReportFixture,
    createBuildResultFixture
} from '../../test-libraries/preview-fixtures.ts';
import { buildPreviewDocument } from './preview-document.ts';
import {
    baseReport,
    buildResult,
    createPackageReport,
    requirePackageAt,
    requireSinglePackage,
    requireTreeNodeAt,
    workspaceFileManager,
    workspaceReader
} from './preview-document-test-support.ts';

suite('preview-document', function () {
    test('buildPreviewDocument orders packages by report order and formats version transitions', async function () {
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
            fileManager: workspaceFileManager(
                workspaceReader({ '/workspace/src/index.js': 'export const removed = 1;\n' })
            )
        });

        assert.deepStrictEqual(
            document.packages.map(function (pkg) {
                return [ pkg.name, pkg.versionTransition ];
            }),
            [
                [ 'pkg-a', '1.0.0 -> 1.0.1' ],
                [ 'pkg-b', '0.0.1' ]
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
                    '/workspace/src/index.js': 'export const removed = 1;\n',
                    '/workspace/src/index.js.map': '{"version":2}',
                    '/workspace/types/index.d.ts': 'export declare const kept: number;\n'
                })
            )
        });

        const pkg = requireSinglePackage(document);
        assert.strictEqual(requireTreeNodeAt(document, 0, 0).path, 'package.json');
        assert.deepStrictEqual(
            pkg
                .tree
                .filter(function (entry) {
                    return entry.type === 'file' && entry.artifact.diff !== undefined;
                })
                .map(function (entry) {
                    return entry.path;
                }),
            [ 'src/index.js' ]
        );
    });

    test('buildPreviewDocument builds exact tree ordering, depths, and summary counts', async function () {
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
            fileManager: workspaceFileManager(
                workspaceReader({
                    '/workspace/src/index.js': 'export const original = 1;\n',
                    '/workspace/types/internal/index.d.ts': 'export declare const kept: number;\n',
                    '/workspace/pkg-b/index.js': 'ok\n'
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

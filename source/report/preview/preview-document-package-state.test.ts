import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import { createArtifactEntryFixture, createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import {
    baseReport,
    buildResult,
    buildSingleArtifactDocument,
    createPackageReport,
    buildUnchangedPackageDocument,
    eliminatedUnusedFile,
    expectTreePaths,
    requirePackageAt,
    requireSinglePackage,
    tinyUnchangedSource,
    workspaceFileManager
} from '../../test-libraries/preview-document-test-support.ts';
import { artifactBadgeLabel, artifactStatusLabel, buildPreviewDocument } from './preview-document.ts';

suite('preview-document package state', function () {
    suite('eliminated source files', function () {
        test('buildPreviewDocument keeps eliminated files separate from the emitted tree', async function () {
            const document = await buildPreviewDocument({
                report: baseReport(),
                result: Result.ok([ buildResult() ]),
                dryRun: true,
                fileManager: workspaceFileManager(async function () {
                    return 'export {};\n';
                })
            });

            const pkg = requireSinglePackage(document);
            assert.deepStrictEqual(pkg.eliminatedSourceFiles, [ eliminatedUnusedFile ]);
            assert.strictEqual(
                pkg.tree.some(function (entry) {
                    return entry.path === eliminatedUnusedFile.path;
                }),
                false
            );
        });

        test('buildPreviewDocument treats eliminated-only packages as changed and opens them by default', async function () {
            const document = await buildUnchangedPackageDocument({ eliminatedSourceFiles: [ eliminatedUnusedFile ] });

            assert.strictEqual(requirePackageAt(document, 0).hasChanges, true);
            assert.strictEqual(requirePackageAt(document, 0).openByDefault, true);
        });
    });

    suite('run result state', function () {
        test('buildPreviewDocument reports failure-only runs with direct issues', async function () {
            const document = await buildPreviewDocument({
                report: { ...baseReport(), packages: {} },
                result: Result.err({ type: 'checks', issues: [ 'bundle is too large' ] }),
                dryRun: true,
                fileManager: workspaceFileManager(async function () {
                    return 'export {};\n';
                })
            });

            assert.partialDeepStrictEqual(document, {
                previewable: false,
                resultType: 'checks',
                issues: [ 'bundle is too large' ]
            });
        });

        test('buildPreviewDocument marks a partial run with succeeded packages as previewable', async function () {
            const document = await buildPreviewDocument({
                report: baseReport(),
                result: Result.err({ type: 'partial', succeeded: [ buildResult() ], failures: [ new Error('boom') ] }),
                dryRun: true,
                fileManager: workspaceFileManager(async function () {
                    return 'export {};\n';
                })
            });

            assert.partialDeepStrictEqual(document, {
                previewable: true,
                resultType: 'partial',
                issues: [ 'boom' ]
            });
        });

        test('buildPreviewDocument uses publish mode when dryRun is false', async function () {
            const document = await buildSingleArtifactDocument({ dryRun: false });

            assert.strictEqual(document.modeLabel, 'Publish');
        });
    });

    suite('package summaries', function () {
        test('buildPreviewDocument keeps unchanged packages closed unless they failed', async function () {
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

        test('buildPreviewDocument leaves versionTransition undefined when no version decision exists', async function () {
            const document = await buildPreviewDocument({
                report: createBuildReportFixture({
                    packages: {
                        'pkg-a': createPackageReport([
                            createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] })
                        ])
                    }
                }),
                result: Result.ok([ buildResult() ]),
                dryRun: true,
                fileManager: workspaceFileManager(async function () {
                    return 'export {};\n';
                })
            });

            assert.strictEqual(requirePackageAt(document, 0).versionTransition, undefined);
        });

        test('buildPreviewDocument handles failed packages without outputs and publish-mode labels', async function () {
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
                result: Result.err({ type: 'partial', succeeded: [], failures: [ new Error('boom') ] }),
                dryRun: false,
                fileManager: workspaceFileManager(async function () {
                    return 'export {};\n';
                })
            });

            assert.strictEqual(document.modeLabel, 'Publish');
            const pkg = requireSinglePackage(document);
            if (pkg.failure === undefined) {
                assert.fail('expected package failure');
            }
            assert.partialDeepStrictEqual(pkg, {
                failure: {
                    message: 'boom'
                },
                openByDefault: true,
                tree: []
            });
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
    });

    suite('artifact tree ordering', function () {
        test('buildPreviewDocument orders directories before files and sorts alphabetically after package.json', async function () {
            await expectTreePaths(
                [
                    tinyUnchangedSource('z-last.js'),
                    createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                    tinyUnchangedSource('a/inside.js')
                ],
                [ 'package.json', 'a', 'a/inside.js', 'z-last.js' ]
            );
        });

        test('buildPreviewDocument reuses existing directories and supports nested directory sorting', async function () {
            await expectTreePaths(
                [
                    tinyUnchangedSource('top.js'),
                    tinyUnchangedSource('nested/deeper/a.js'),
                    tinyUnchangedSource('nested/deeper/b.js')
                ],
                [ 'nested', 'nested/deeper', 'nested/deeper/a.js', 'nested/deeper/b.js', 'top.js' ]
            );
        });
    });

    suite('artifact labels', function () {
        test('artifactStatusLabel returns the canonical "generated", "changed", or "unchanged" string for each artifact status', function () {
            assert.strictEqual(artifactStatusLabel('generated'), 'generated');
            assert.strictEqual(artifactStatusLabel('changed'), 'changed');
            assert.strictEqual(artifactStatusLabel('unchanged'), 'unchanged');
        });

        test('artifactBadgeLabel returns "DCE" for dead-code-elimination and "rewrite" for import-path-rewrite', function () {
            assert.strictEqual(artifactBadgeLabel('dead-code-elimination'), 'DCE');
            assert.strictEqual(artifactBadgeLabel('import-path-rewrite'), 'rewrite');
        });
    });
});

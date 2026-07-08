import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import {
    createAnalyzedResource,
    createArtifactEntryFixture,
    createBuildResultFixture
} from '../../test-libraries/preview-fixtures.ts';
import {
    assertFirstFileHasNoDiff,
    buildChangedSourceDiffDocument,
    buildSingleArtifactDocument,
    requireFileNodeAt,
    requireFileNodeByPath,
    requirePackageAt,
    reportForPkgA,
    workspaceFileManager
} from '../../test-libraries/preview-document-test-support.ts';
import { buildPreviewDocument } from './preview-document.ts';

suite('preview-document diffs', function () {
    test('buildPreviewDocument omits diffs when the artifact source path does not match the emitted content source', async function () {
        const document = await buildSingleArtifactDocument({
            artifactSourcePath: '/workspace/actual.js',
            reportSourcePath: '/workspace/other.js',
            emittedContent: 'export const changed = 1;\n',
            workspaceContent: 'export const original = 1;\n'
        });

        assertFirstFileHasNoDiff(document);
    });

    test('buildPreviewDocument reads workspace files through the injected file manager', async function () {
        const sourceFilePath = '/workspace/index.js';

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
            dryRun: true,
            fileManager: workspaceFileManager(async function (requestedPath) {
                assert.strictEqual(requestedPath, sourceFilePath);
                return 'export const original = 1;\n';
            })
        });

        const fileNode = requirePackageAt(document, 0).tree.find(
            function (entry) {
                return entry.type === 'file' && entry.path === 'index.js';
            }
        );
        if (fileNode?.type !== 'file') {
            assert.fail('expected index.js file node');
        }
        assert.notStrictEqual(fileNode.artifact.diff, undefined);
    });

    test('buildPreviewDocument limits diffs to two hunks and drops patch metadata lines', async function () {
        const document = await buildChangedSourceDiffDocument(
            'a();\nkeep1();\nkeep2();\nkeep3();\nkeep4();\nkeep5();\nkeep6();\nkeep7();\nkeep8();\nb();\nkeep9();\nkeep10();\nkeep11();\nkeep12();\nkeep13();\nkeep14();\nkeep15();\nkeep16();\nc();\n',
            'oldA();\nkeep1();\nkeep2();\nkeep3();\nkeep4();\nkeep5();\nkeep6();\nkeep7();\nkeep8();\noldB();\nkeep9();\nkeep10();\nkeep11();\nkeep12();\nkeep13();\nkeep14();\nkeep15();\nkeep16();\noldC();\n'
        );

        const { diff } = requireFileNodeByPath(document, 0, 'src/index.js').artifact;
        if (diff === undefined) {
            assert.fail('expected diff');
        }
        assert.deepStrictEqual(
            diff.map(function (hunk) {
                return [
                    hunk.header,
                    hunk.lines.some(function (line) {
                        return line.text.startsWith('\\');
                    })
                ];
            }),
            [
                [ '@@ -1,4 +1,4 @@', false ],
                [ '@@ -7,7 +7,7 @@', false ]
            ]
        );
    });

    test('buildPreviewDocument drops no-newline markers from diff lines', async function () {
        const document = await buildChangedSourceDiffDocument('changed', 'original');

        const { diff } = requireFileNodeByPath(document, 0, 'src/index.js').artifact;
        if (diff === undefined) {
            assert.fail('expected diff');
        }
        assert.ok(
            diff.every(function (hunk) {
                return hunk.lines.every(function (line) {
                    return !line.text.startsWith('\\');
                });
            })
        );
    });

    test('buildPreviewDocument does not attach a diff property when no diff exists', async function () {
        const document = await buildSingleArtifactDocument();
        const fileNode = requireFileNodeAt(document, 0, 0);

        assert.strictEqual(Object.hasOwn(fileNode.artifact, 'diff'), false);
    });

    test('buildPreviewDocument skips diffs when the emitted artifact content matches the workspace file', async function () {
        assertFirstFileHasNoDiff(await buildSingleArtifactDocument());
    });

    test('buildPreviewDocument skips diffs when the report source path does not match the emitted artifact source path', async function () {
        assertFirstFileHasNoDiff(
            await buildSingleArtifactDocument({
                reportSourcePath: '/workspace/report-index.js',
                workspaceContent: 'export const same = 1;\n'
            })
        );
    });

    test('buildPreviewDocument labels unchanged context lines in generated diffs', async function () {
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
            diff.some(function (hunk) {
                return hunk.lines.some(function (line) {
                    return line.type === 'context';
                });
            }),
            true
        );
    });
});

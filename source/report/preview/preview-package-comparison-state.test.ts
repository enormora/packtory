import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import type { WorkspaceSnapshot } from '../inspectors/inspect-workspace.ts';
import {
    createArtifactEntryFixture,
    createBuildReportFixture,
    createPackageReportFixture
} from '../../test-libraries/preview-fixtures.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { buildPreviewDocument, type PreviewDocument } from './preview-document.ts';

const empty: WorkspaceSnapshot = {
    files: [],
    imports: [],
    modules: [],
    dependencies: {},
    peerDependencies: {},
    exports: '{}',
    executables: '{}'
};

async function packageState(before: WorkspaceSnapshot, after: WorkspaceSnapshot): Promise<PreviewDocument> {
    const packageReport = createPackageReportFixture({
        workspaceSnapshot: before,
        packageSnapshot: after,
        eliminatedSourceFiles: [],
        outputs: { tarball: { entries: [ createArtifactEntryFixture({ status: 'unchanged' }) ], totalBytes: 20 } }
    });
    return buildPreviewDocument({
        report: createBuildReportFixture({ packages: { 'package-a': packageReport } }),
        result: Result.ok([]),
        dryRun: true,
        fileManager: createFakeFileManager()
    });
}

suite('preview package comparison state', function () {
    test('marks dependency-only transformations as changed and opens the package', async function () {
        const before = { ...empty, dependencies: { retained: '^1', unused: '^2' } };
        const after = { ...empty, dependencies: { retained: '^1' } };
        const document = await packageState(before, after);
        assert.partialDeepStrictEqual(document, {
            summary: { changedPackages: 1, unchangedPackages: 0 },
            packages: [ { hasChanges: true, openByDefault: true } ]
        });
    });

    test('marks public surface changes as changed without relying on file transformations', async function () {
        const document = await packageState(empty, { ...empty, exports: '{".":"./index.js"}' });
        assert.partialDeepStrictEqual(document, {
            summary: { changedPackages: 1 },
            packages: [ { hasChanges: true, openByDefault: true } ]
        });
    });

    test('keeps equal and equally unknown comparisons unchanged', async function () {
        const unknown = { ...empty, modules: [ { specifier: 'pkg', values: [], types: [], complete: false } ] };
        const document = await packageState(unknown, unknown);
        assert.partialDeepStrictEqual(document, {
            summary: { changedPackages: 0, unchangedPackages: 1 },
            packages: [ { hasChanges: false, openByDefault: false } ]
        });
        assert.partialDeepStrictEqual(await packageState(empty, empty), {
            summary: { changedPackages: 0 },
            packages: [ { hasChanges: false } ]
        });
    });
});

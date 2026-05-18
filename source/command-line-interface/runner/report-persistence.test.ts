import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { BuildReport, Packtory } from '../../packtory/packtory.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { createEmptyReport, writeReports } from './report-persistence.ts';

type PublishResult = Awaited<ReturnType<Packtory['buildAndPublishAll']>>['result'];

const emptyResult = { isOk: false, isErr: true, error: { type: 'config', issues: [] } } as unknown as PublishResult;
const emptyReport: BuildReport = {
    schemaVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    packages: {},
    aggregate: { crossBundleLinks: [] }
};

suite('report-persistence', function () {
    test('createEmptyReport returns a schema-version-1 report with no packages or aggregate links', function () {
        const report = createEmptyReport();

        assert.strictEqual(report.schemaVersion, 1);
        assert.deepStrictEqual(report.packages, {});
        assert.deepStrictEqual(report.aggregate, { crossBundleLinks: [] });
    });

    test('writeReports writes nothing when the report is undefined', async function () {
        const fileManager = createFakeFileManager();

        await writeReports(fileManager, undefined, emptyResult, { reportJson: true, reportHtml: true }, false);

        assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
    });

    test('writeReports skips both formats when both flags are disabled', async function () {
        const fileManager = createFakeFileManager();

        await writeReports(fileManager, emptyReport, emptyResult, { reportJson: false, reportHtml: false }, false);

        assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
    });

    test('writeReports writes a JSON report when reportJson is enabled', async function () {
        const fileManager = createFakeFileManager();

        await writeReports(fileManager, emptyReport, emptyResult, { reportJson: true, reportHtml: false }, false);

        assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
        const call = fileManager.getWriteFileCall(0);
        assert.strictEqual(call.filePath, 'packtory-report.json');
        assert.deepStrictEqual(JSON.parse(call.content), emptyReport);
    });
});

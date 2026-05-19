import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import type { BuildReport, PackageReport } from '../aggregator/report-types.ts';
import type { ReleaseDiffAllResult } from '../../packtory/packtory.ts';
import { buildReleaseDiffDocument } from './release-diff-document.ts';
import type { PackageReleaseDiff } from './file-set-diff.ts';

function packageReport(overrides: Partial<PackageReport> = {}): PackageReport {
    return { decisions: {}, timings: {}, ...overrides };
}

function buildReport(overrides: Partial<BuildReport> = {}): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-19T00:00:00.000Z',
        packages: {},
        aggregate: { crossBundleLinks: [] },
        ...overrides
    };
}

function releaseDiffPackage(overrides: Partial<PackageReleaseDiff> = {}): PackageReleaseDiff {
    return {
        name: 'pkg-a',
        state: 'changed',
        versionTransition: '1.0.0 -> 1.0.1',
        previousVersionLabel: '1.0.0',
        files: { added: [], removed: [], modified: [], unchanged: [] },
        diagnostics: packageReport(),
        ...overrides
    };
}

const successResult: ReleaseDiffAllResult = Result.ok([]);

suite('release-diff-document', function () {
    test('builds a document with title, mode label, and previewable flag set for a successful result', function () {
        const document = buildReleaseDiffDocument({
            report: buildReport(),
            result: successResult,
            packages: [releaseDiffPackage()]
        });
        assert.strictEqual(document.title, 'Packtory release diff');
        assert.strictEqual(document.modeLabel, 'vs registry latest');
        assert.strictEqual(document.previewable, true);
        assert.strictEqual(document.resultType, 'success');
    });

    test('counts failed packages from the build report into the summary', function () {
        const report = buildReport({
            packages: {
                'pkg-a': packageReport(),
                'pkg-broken': packageReport({ failure: { stage: 'publish', message: 'kaboom' } })
            }
        });
        const document = buildReleaseDiffDocument({
            report,
            result: successResult,
            packages: [releaseDiffPackage()]
        });
        assert.strictEqual(document.summary.failedPackages, 1);
        assert.strictEqual(document.summary.totalPackages, 2);
    });

    test('forwards the package list into the document verbatim', function () {
        const pkg = releaseDiffPackage({ name: 'pkg-x', state: 'first-publish' });
        const document = buildReleaseDiffDocument({
            report: buildReport(),
            result: successResult,
            packages: [pkg]
        });
        assert.strictEqual(document.packages.length, 1);
        assert.strictEqual(document.packages[0], pkg);
    });
});

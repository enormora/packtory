import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import type { BuildReport, PackageReport } from '../aggregator/report-types.ts';
import type { ReleaseDiffAllResult } from '../../packtory/packtory.ts';
import { createPackageReleaseDiff as releaseDiffPackage } from '../../test-libraries/release-diff-fixtures.ts';
import { buildReleaseDiffDocument } from './release-diff-document.ts';

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

const successResult: ReleaseDiffAllResult = Result.ok([]);

suite('release-diff-document', function () {
    test('builds a document with title, mode label, and previewable flag set for a successful result', function () {
        const document = buildReleaseDiffDocument({
            report: buildReport(),
            result: successResult,
            packages: [ releaseDiffPackage() ]
        });
        assert.partialDeepStrictEqual(document, {
            title: 'Packtory release diff',
            modeLabel: 'vs registry latest',
            previewable: true,
            resultType: 'success'
        });
    });

    test('counts only packages with a failure (asymmetric mix to detect equality-operator inversion)', function () {
        const report = buildReport({
            packages: {
                'pkg-a': packageReport(),
                'pkg-b': packageReport(),
                'pkg-broken': packageReport({ failure: { stage: 'publish', message: 'kaboom' } })
            }
        });
        const document = buildReleaseDiffDocument({
            report,
            result: successResult,
            packages: [ releaseDiffPackage() ]
        });
        assert.strictEqual(document.summary.failedPackages, 1);
    });

    test('forwards the package list into the document verbatim', function () {
        const pkg = releaseDiffPackage({ name: 'pkg-x', state: 'first-publish' });
        const document = buildReleaseDiffDocument({
            report: buildReport(),
            result: successResult,
            packages: [ pkg ]
        });
        assert.strictEqual(document.packages.length, 1);
        assert.strictEqual(document.packages[0], pkg);
    });
});
